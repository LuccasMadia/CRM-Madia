import { describe, it, expect } from 'vitest';
import { criarContexto } from '../test/contexto.js';

describe('GET /api/painel', () => {
  it('monta os cartões e não manda mais os próximos 7 dias', async () => {
    const ctx = criarContexto({ hoje: '2026-09-23' });
    const cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
    const emAndamento = (await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'Site', etapa: 'andamento', prazo_entrega: '2026-09-28',
    })).body;
    await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Proposta', etapa: 'valor_definido', valor_total_centavos: 80000 });
    await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Testando', etapa: 'teste', valor_total_centavos: 20000 });
    await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Protótipo', etapa: 'prototipo', valor_total_centavos: 5000 });
    const parcelas = `/api/projetos/${emAndamento.id}/parcelas`;
    await ctx.http.post(parcelas).send({ valor_centavos: 1000, vencimento: '2026-09-10' });
    await ctx.http.post(parcelas).send({ valor_centavos: 2000, vencimento: '2026-09-30' });
    await ctx.http.post(`/api/projetos/${emAndamento.id}/tarefas`).send({ texto: 'Revisar', prazo: '2026-09-24' });
    await ctx.http.post('/api/conteudos').send({ titulo: 'Post', tipo: 'post', data_planejada: '2026-09-25' });

    const res = await ctx.http.get('/api/painel').expect(200);
    expect(res.body.cartoes).toEqual({
      a_receber_mes_centavos: 3000,
      atrasadas: { quantidade: 1, total_centavos: 1000 },
      em_andamento: 2,
      em_andamento_detalhe: { prototipo: 1, andamento: 1 },
      recebido_mes_centavos: 0,
      propostas: { quantidade: 2, total_centavos: 100000 },
    });
    expect(res.body.proximos).toBeUndefined();
  });

  it('ignora projetos fictícios nos cartões', async () => {
    const ctx = criarContexto({ hoje: '2026-09-23' });
    const cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
    await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'Site real', etapa: 'andamento', prazo_entrega: '2026-09-28',
    });
    const ficticio = (await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'Case fictício', etapa: 'andamento', prazo_entrega: '2026-09-28', ficticio: true,
    })).body;
    await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Proposta fictícia', etapa: 'valor_definido', valor_total_centavos: 80000, ficticio: true });
    await ctx.http.post(`/api/projetos/${ficticio.id}/parcelas`).send({ valor_centavos: 5000, vencimento: '2026-09-10' });
    await ctx.http.post(`/api/projetos/${ficticio.id}/tarefas`).send({ texto: 'Revisar case', prazo: '2026-09-24' });

    const res = await ctx.http.get('/api/painel').expect(200);
    expect(res.body.cartoes.em_andamento).toBe(1);
    expect(res.body.cartoes.propostas).toEqual({ quantidade: 0, total_centavos: 0 });
    expect(res.body.cartoes.atrasadas).toEqual({ quantidade: 0, total_centavos: 0 });
  });

  it('agrupa tarefas por projeto (com e sem prazo) e lista a divulgação pendente à parte', async () => {
    const ctx = criarContexto({ hoje: '2026-09-23' });
    const cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
    const real = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Site real', etapa: 'entregue' })).body;
    const ficticio = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Case fictício', etapa: 'entregue', ficticio: true })).body;
    await ctx.http.post(`/api/projetos/${real.id}/tarefas`).send({ texto: 'Com prazo', prazo: '2026-09-30' });
    await ctx.http.post(`/api/projetos/${real.id}/tarefas`).send({ texto: 'Sem prazo', etapa: 'aguardando_cliente' });
    await ctx.http.post(`/api/projetos/${real.id}/tarefas`).send({ texto: 'Feita', etapa: 'concluido' });
    await ctx.http.post(`/api/projetos/${ficticio.id}/tarefas`).send({ texto: 'Tarefa do case' });
    await ctx.http.put(`/api/projetos/${real.id}`).send({ postou_instagram: true });

    const res = await ctx.http.get('/api/painel').expect(200);

    expect(res.body.tarefas_por_projeto.reais).toEqual([
      { projeto_id: real.id, projeto_titulo: 'Site real', tarefas: [
        { id: expect.any(Number), texto: 'Com prazo', prazo: '2026-09-30', etapa: 'a_fazer' },
        { id: expect.any(Number), texto: 'Sem prazo', prazo: null, etapa: 'aguardando_cliente' },
      ] },
    ]);
    expect(res.body.tarefas_por_projeto.ficticios).toEqual([
      { projeto_id: ficticio.id, projeto_titulo: 'Case fictício', tarefas: [
        { id: expect.any(Number), texto: 'Tarefa do case', prazo: null, etapa: 'a_fazer' },
      ] },
    ]);
    expect(res.body.divulgacao).toEqual([
      { projeto_id: real.id, projeto_titulo: 'Site real', ficticio: false, falta: ['portfolio'] },
      { projeto_id: ficticio.id, projeto_titulo: 'Case fictício', ficticio: true, falta: ['instagram', 'portfolio'] },
    ]);
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
    expect(res.body.divulgacao.filter((p) => p.projeto_id === gmnPronto.id)).toEqual([]);
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
    novoProjeto(ctx, { clienteId: ana.id, titulo: 'Proposta', etapa: 'valor_definido' });
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
        { etapa: 'ideia', quantidade: 3, percentual: 100 },
        { etapa: 'apresentado', quantidade: 2, percentual: 67 },
        { etapa: 'valor_definido', quantidade: 2, percentual: 67 },
        { etapa: 'teste', quantidade: 1, percentual: 33 },
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

describe('GET /api/painel mensalidades', () => {
  it('a Início gera as mensalidades devidas antes de calcular os números', async () => {
    const ctx = criarContexto({ hoje: '2026-09-23' });
    const cli = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
    const proj = (await ctx.http.post('/api/projetos').send({ cliente_id: cli.id, titulo: 'Site' })).body;
    await ctx.http.put(`/api/projetos/${proj.id}`).send({
      mensalidade_ativa: true, mensalidade_valor_centavos: 5000, mensalidade_dia_vencimento: 10,
      mensalidade_inicio_modo: 'data', mensalidade_inicio_data: '2026-08-10',
    }).expect(200);
    await ctx.http.get('/api/painel').expect(200);
    expect(ctx.db.prepare('SELECT vencimento FROM parcelas WHERE projeto_id = ? ORDER BY vencimento').all(proj.id).map((p) => p.vencimento))
      .toEqual(['2026-08-10', '2026-09-10']);
  });
});

describe('GET /api/painel Mission Control', () => {
  const projeto = (ctx, clienteId, titulo, etapa, ficticio = 0) => ctx.db.prepare(
    `INSERT INTO projetos (cliente_id, titulo, etapa, servico, ficticio, criado_em, atualizado_em)
     VALUES (?, ?, ?, 'site_sistema', ?, '2026-01-01', '2026-01-01')`,
  ).run(clienteId, titulo, etapa, ficticio).lastInsertRowid;
  const paga = (ctx, projetoId, valor, pagoEm) => ctx.db.prepare(
    `INSERT INTO parcelas (projeto_id, valor_centavos, vencimento, pago_em, criado_em, atualizado_em)
     VALUES (?, ?, ?, ?, '2026-01-01', '2026-01-01')`,
  ).run(projetoId, valor, pagoEm, pagoEm);

  async function comPagas() {
    const ctx = criarContexto({ hoje: '2026-09-23' });
    const ana = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
    const real = projeto(ctx, ana.id, 'Site', 'entregue');
    const ficticio = projeto(ctx, ana.id, 'Case', 'entregue', 1);
    paga(ctx, real, 1000, '2026-09-10');
    paga(ctx, real, 500, '2026-08-30');
    paga(ctx, ficticio, 700, '2026-09-10');
    return ctx;
  }

  it('recebido no mês soma parcelas e placas pagas no mês atual e ignora outro mês e fictício', async () => {
    const ctx = await comPagas();
    const res = await ctx.http.get('/api/painel').expect(200);
    expect(res.body.cartoes.recebido_mes_centavos).toBe(1000);
  });

  it('recebido no mês bate com o mês atual de /painel/graficos', async () => {
    const ctx = await comPagas();
    const painel = (await ctx.http.get('/api/painel')).body;
    const graficos = (await ctx.http.get('/api/painel/graficos')).body;
    expect(painel.cartoes.recebido_mes_centavos).toBe(graficos.recebido_por_mes.find((m) => m.mes === '2026-09').total_centavos);
  });

  it('em_andamento_detalhe separa protótipo e versão final e soma em_andamento', async () => {
    const ctx = criarContexto({ hoje: '2026-09-23' });
    const ana = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
    projeto(ctx, ana.id, 'P1', 'prototipo');
    projeto(ctx, ana.id, 'A1', 'andamento');
    projeto(ctx, ana.id, 'A2', 'andamento');
    projeto(ctx, ana.id, 'Case', 'andamento', 1);
    const { cartoes } = (await ctx.http.get('/api/painel')).body;
    expect(cartoes.em_andamento_detalhe).toEqual({ prototipo: 1, andamento: 2 });
    expect(cartoes.em_andamento_detalhe.prototipo + cartoes.em_andamento_detalhe.andamento).toBe(cartoes.em_andamento);
  });

  it('pede_atencao é igual ao do cérebro', async () => {
    const ctx = criarContexto({ hoje: '2026-09-23' });
    const ana = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
    const proj = (await ctx.http.post('/api/projetos').send({ cliente_id: ana.id, titulo: 'Site', etapa: 'andamento' })).body;
    await ctx.http.post(`/api/projetos/${proj.id}/parcelas`).send({ valor_centavos: 1000, vencimento: '2026-09-10' });
    const painel = (await ctx.http.get('/api/painel')).body;
    const cerebro = (await ctx.http.get('/api/cerebro')).body;
    expect(painel.pede_atencao.length).toBeGreaterThan(0);
    expect(painel.pede_atencao).toEqual(cerebro.pede_atencao);
  });

  it('banco vazio: recebido 0, detalhe {0,0}, pede_atencao []', async () => {
    const ctx = criarContexto({ hoje: '2026-09-23' });
    const { cartoes, pede_atencao } = (await ctx.http.get('/api/painel')).body;
    expect(cartoes.recebido_mes_centavos).toBe(0);
    expect(cartoes.em_andamento_detalhe).toEqual({ prototipo: 0, andamento: 0 });
    expect(pede_atencao).toEqual([]);
  });
});
