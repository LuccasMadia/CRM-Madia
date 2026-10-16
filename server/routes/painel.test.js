import { describe, it, expect } from 'vitest';
import { criarContexto } from '../test/contexto.js';

describe('GET /api/painel', () => {
  it('monta cartões e próximos 7 dias', async () => {
    const ctx = criarContexto({ hoje: '2026-09-23' });
    const cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
    const emAndamento = (await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'Site', etapa: 'andamento', prazo_entrega: '2026-09-28',
    })).body;
    await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Proposta', etapa: 'proposta', valor_total_centavos: 80000 });
    const parcelas = `/api/projetos/${emAndamento.id}/parcelas`;
    await ctx.http.post(parcelas).send({ valor_centavos: 1000, vencimento: '2026-09-10' });
    await ctx.http.post(parcelas).send({ valor_centavos: 2000, vencimento: '2026-09-30' });
    await ctx.http.post(`/api/projetos/${emAndamento.id}/tarefas`).send({ texto: 'Revisar', prazo: '2026-09-24' });
    await ctx.http.post('/api/conteudos').send({ titulo: 'Post', tipo: 'post', data_planejada: '2026-09-25' });

    const res = await ctx.http.get('/api/painel').expect(200);
    expect(res.body.cartoes).toEqual({
      a_receber_mes_centavos: 3000,
      atrasadas: { quantidade: 1, total_centavos: 1000 },
      em_andamento: 1,
      propostas: { quantidade: 1, total_centavos: 80000 },
    });
    expect(res.body.proximos.map((i) => i.tipo)).toEqual(['parcela', 'conteudo', 'entrega', 'parcela']);
  });

  it('ignora projetos fictícios nos cartões e nos próximos', async () => {
    const ctx = criarContexto({ hoje: '2026-09-23' });
    const cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
    await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'Site real', etapa: 'andamento', prazo_entrega: '2026-09-28',
    });
    const ficticio = (await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'Case fictício', etapa: 'andamento', prazo_entrega: '2026-09-28', ficticio: true,
    })).body;
    await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Proposta fictícia', etapa: 'proposta', valor_total_centavos: 80000, ficticio: true });
    await ctx.http.post(`/api/projetos/${ficticio.id}/parcelas`).send({ valor_centavos: 5000, vencimento: '2026-09-10' });
    await ctx.http.post(`/api/projetos/${ficticio.id}/tarefas`).send({ texto: 'Revisar case', prazo: '2026-09-24' });

    const res = await ctx.http.get('/api/painel').expect(200);
    expect(res.body.cartoes.em_andamento).toBe(1);
    expect(res.body.cartoes.propostas).toEqual({ quantidade: 0, total_centavos: 0 });
    expect(res.body.cartoes.atrasadas).toEqual({ quantidade: 0, total_centavos: 0 });
    expect(res.body.proximos.every((i) => i.titulo !== 'Case fictício' && i.titulo !== 'Revisar case')).toBe(true);
    expect(res.body.proximos.some((i) => i.titulo === 'Site real')).toBe(true);
  });

  it('agrupa tarefas por projeto (com e sem prazo) e lista divulgação pendente', async () => {
    const ctx = criarContexto({ hoje: '2026-09-23' });
    const cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
    const real = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Site real', etapa: 'entregue' })).body;
    const ficticio = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Case fictício', etapa: 'entregue', ficticio: true })).body;
    await ctx.http.post(`/api/projetos/${real.id}/tarefas`).send({ texto: 'Com prazo', prazo: '2026-09-30' });
    await ctx.http.post(`/api/projetos/${real.id}/tarefas`).send({ texto: 'Sem prazo' });
    await ctx.http.post(`/api/projetos/${ficticio.id}/tarefas`).send({ texto: 'Tarefa do case' });
    await ctx.http.put(`/api/projetos/${real.id}`).send({ postou_instagram: true });

    const res = await ctx.http.get('/api/painel').expect(200);

    expect(res.body.tarefas_por_projeto.reais).toEqual([
      { projeto_id: real.id, projeto_titulo: 'Site real', tarefas: [
        { id: expect.any(Number), texto: 'Com prazo', prazo: '2026-09-30' },
        { id: expect.any(Number), texto: 'Sem prazo', prazo: null },
        { id: `divulgacao-${real.id}-Publicar no portfólio`, texto: 'Publicar no portfólio', prazo: null },
      ] },
    ]);
    expect(res.body.tarefas_por_projeto.ficticios).toEqual([
      { projeto_id: ficticio.id, projeto_titulo: 'Case fictício', tarefas: [
        { id: expect.any(Number), texto: 'Tarefa do case', prazo: null },
        { id: `divulgacao-${ficticio.id}-Postar no Instagram`, texto: 'Postar no Instagram', prazo: null },
        { id: `divulgacao-${ficticio.id}-Publicar no portfólio`, texto: 'Publicar no portfólio', prazo: null },
      ] },
    ]);
    expect(res.body.proximos.some((i) => i.tipo === 'tarefa')).toBe(false);
    expect(res.body.divulgacao_pendente).toBeUndefined();
  });

  it('conta só sites nos cartões, ignora GMN/placas na divulgação e lista o que falta entregar', async () => {
    const ctx = criarContexto({ hoje: '2026-09-23' });
    const ana = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
    await ctx.http.post('/api/projetos').send({ cliente_id: ana.id, titulo: 'Site', etapa: 'andamento' });
    const gmn = (await ctx.http.post('/api/projetos').send({
      cliente_id: ana.id, titulo: 'Google Meu Negócio', servico: 'google_meu_negocio', valor_total_centavos: 2000, vencimento: '2026-09-25',
    })).body;
    const gmnPronto = (await ctx.http.post('/api/projetos').send({ cliente_id: ana.id, titulo: 'GMN antigo', servico: 'google_meu_negocio' })).body;
    await ctx.http.put(`/api/projetos/${gmnPronto.id}`).send({ etapa: 'entregue' }).expect(200);

    const res = await ctx.http.get('/api/painel').expect(200);
    expect(res.body.cartoes.em_andamento).toBe(1);
    expect(res.body.para_entregar).toEqual({
      gmn: 1, placas: 0,
      itens: [{ projeto_id: gmn.id, cliente_id: ana.id, cliente_nome: 'Ana', servico: 'google_meu_negocio' }],
    });
    const divulgacao = [...res.body.tarefas_por_projeto.reais].filter((p) => p.projeto_id === gmnPronto.id);
    expect(divulgacao).toEqual([]);
    expect(res.body.proximos.find((i) => i.tipo === 'parcela')).toMatchObject({ servico: 'google_meu_negocio', cliente_id: ana.id });
  });
});

describe('GET /api/painel/graficos', () => {
  function novoProjeto(ctx, { clienteId, titulo, etapa, servico = 'site_sistema', ficticio = 0 }) {
    return ctx.db.prepare(
      `INSERT INTO projetos (cliente_id, titulo, etapa, servico, ficticio, criado_em, atualizado_em)
       VALUES (?, ?, ?, ?, ?, '2026-01-01', '2026-01-01')`,
    ).run(clienteId, titulo, etapa, servico, ficticio).lastInsertRowid;
  }
  function parcelaPaga(ctx, projetoId, valor, pagoEm) {
    ctx.db.prepare(
      `INSERT INTO parcelas (projeto_id, valor_centavos, vencimento, pago_em, criado_em, atualizado_em)
       VALUES (?, ?, ?, ?, '2026-01-01', '2026-01-01')`,
    ).run(projetoId, valor, pagoEm, pagoEm);
  }

  it('monta os 4 gráficos sem fictícios', async () => {
    const ctx = criarContexto({ hoje: '2026-10-16' });
    const ana = (await ctx.http.post('/api/clientes').send({ nome: 'Ana', origem: 'Instagram' })).body;
    await ctx.http.post('/api/clientes').send({ nome: 'Bruno', origem: ' instagram ' });
    await ctx.http.post('/api/clientes').send({ nome: 'Davi', origem: 'Instagram' });
    await ctx.http.post('/api/clientes').send({ nome: 'Caio' });

    const entregue = novoProjeto(ctx, { clienteId: ana.id, titulo: 'Site', etapa: 'entregue' });
    novoProjeto(ctx, { clienteId: ana.id, titulo: 'Proposta', etapa: 'proposta' });
    novoProjeto(ctx, { clienteId: ana.id, titulo: 'Perdido', etapa: 'perdido' });
    const ficticio = novoProjeto(ctx, { clienteId: ana.id, titulo: 'Case', etapa: 'entregue', ficticio: 1 });
    const gmn = novoProjeto(ctx, { clienteId: ana.id, titulo: 'GMN', etapa: 'entregue', servico: 'google_meu_negocio' });

    parcelaPaga(ctx, entregue, 100000, '2026-10-05');
    parcelaPaga(ctx, entregue, 50000, '2026-04-10');
    parcelaPaga(ctx, ficticio, 999900, '2026-10-01');
    parcelaPaga(ctx, gmn, 20000, '2026-09-12');

    const res = await ctx.http.get('/api/painel/graficos').expect(200);
    expect(res.body.funil).toEqual({
      etapas: [
        { etapa: 'contato', quantidade: 3, percentual: 100 },
        { etapa: 'proposta', quantidade: 2, percentual: 67 },
        { etapa: 'andamento', quantidade: 1, percentual: 33 },
        { etapa: 'entregue', quantidade: 1, percentual: 33 },
      ],
      perdidos: 1,
    });
    expect(res.body.recebido_por_mes.map((m) => m.total_centavos)).toEqual([0, 0, 0, 0, 20000, 100000]);
    expect(res.body.recebido_por_mes[5].mes).toBe('2026-10');
    expect(res.body.origens).toEqual({
      total: 4,
      fatias: [{ nome: 'Instagram', quantidade: 3 }, { nome: 'Não informado', quantidade: 1 }],
    });
    expect(res.body.por_servico).toEqual([
      { servico: 'site_sistema', total_centavos: 150000 },
      { servico: 'google_meu_negocio', total_centavos: 20000 },
      { servico: 'placas_nfc', total_centavos: 0 },
    ]);
  });

  it('com banco vazio devolve tudo zerado', async () => {
    const ctx = criarContexto({ hoje: '2026-10-16' });
    const res = await ctx.http.get('/api/painel/graficos').expect(200);
    expect(res.body.funil.etapas.every((e) => e.quantidade === 0)).toBe(true);
    expect(res.body.recebido_por_mes).toHaveLength(6);
    expect(res.body.origens).toEqual({ total: 0, fatias: [] });
    expect(res.body.por_servico.every((s) => s.total_centavos === 0)).toBe(true);
  });
});
