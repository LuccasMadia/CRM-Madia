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
    await ctx.http.post('/api/conteudos').send({ titulo: 'Post', canal: 'instagram', tipo: 'post', data_planejada: '2026-09-25' });

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
      ] },
    ]);
    expect(res.body.tarefas_por_projeto.ficticios).toEqual([
      { projeto_id: ficticio.id, projeto_titulo: 'Case fictício', tarefas: [{ id: expect.any(Number), texto: 'Tarefa do case', prazo: null }] },
    ]);
    expect(res.body.proximos.some((i) => i.tipo === 'tarefa')).toBe(false);

    expect(res.body.divulgacao_pendente).toEqual([
      { projeto_id: ficticio.id, titulo: 'Case fictício', ficticio: true, falta_portfolio: true, falta_instagram: true },
      { projeto_id: real.id, titulo: 'Site real', ficticio: false, falta_portfolio: true, falta_instagram: false },
    ]);
  });
});
