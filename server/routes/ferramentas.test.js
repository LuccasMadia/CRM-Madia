import { describe, it, expect, beforeEach } from 'vitest';
import { criarContexto } from '../test/contexto.js';

let ctx;
beforeEach(() => {
  ctx = criarContexto({ hoje: '2026-10-20' });
});

const listar = async (consulta = '') => (await ctx.http.get(`/api/ferramentas${consulta}`).expect(200)).body;

describe('/api/ferramentas', () => {
  it('já vem com a assinatura do Claude, valendo 0 até ser preenchida', async () => {
    const { mes, ferramentas, total_mes_centavos } = await listar();
    expect(mes).toBe('2026-10');
    expect(ferramentas).toEqual([
      expect.objectContaining({ nome: 'Claude', cobranca: 'mensalidade', valor_centavos: 0, ativa: 1, gasto_mes_centavos: 0 }),
    ]);
    expect(total_mes_centavos).toBe(0);
  });

  it('cria mensalidade e créditos; créditos não guardam valor nem dia', async () => {
    const mensal = (await ctx.http.post('/api/ferramentas')
      .send({ nome: ' Cursor ', cobranca: 'mensalidade', valor_centavos: 11000, dia_cobranca: 5 }).expect(201)).body;
    expect(mensal).toMatchObject({ nome: 'Cursor', valor_centavos: 11000, dia_cobranca: 5, ativa: 1 });
    const creditos = (await ctx.http.post('/api/ferramentas')
      .send({ nome: 'API OpenAI', cobranca: 'creditos', valor_centavos: 999, dia_cobranca: 3 }).expect(201)).body;
    expect(creditos).toMatchObject({ cobranca: 'creditos', valor_centavos: null, dia_cobranca: null });
  });

  it('valida nome, tipo, valor da mensalidade e dia', async () => {
    const erros = async (corpo) => (await ctx.http.post('/api/ferramentas').send(corpo).expect(400)).body.erros;
    expect(await erros({ cobranca: 'mensalidade', valor_centavos: 100 })).toEqual([{ campo: 'nome', mensagem: 'Obrigatório' }]);
    expect(await erros({ nome: 'X', cobranca: 'anual' })).toEqual([{ campo: 'cobranca', mensagem: 'Valor inválido: anual' }]);
    expect(await erros({ nome: 'X', cobranca: 'mensalidade' })).toEqual([{ campo: 'valor_centavos', mensagem: 'Obrigatório' }]);
    expect(await erros({ nome: 'X', cobranca: 'mensalidade', valor_centavos: 100, dia_cobranca: 32 }))
      .toEqual([{ campo: 'dia_cobranca', mensagem: 'Deve ser no máximo 31' }]);
  });

  it('total do mês soma mensalidades ativas e recargas do mês', async () => {
    await ctx.http.put('/api/ferramentas/1').send({ valor_centavos: 11000 }).expect(200);
    const parada = (await ctx.http.post('/api/ferramentas').send({ nome: 'Midjourney', cobranca: 'mensalidade', valor_centavos: 5000 })).body;
    await ctx.http.put(`/api/ferramentas/${parada.id}`).send({ ativa: false }).expect(200);
    const api = (await ctx.http.post('/api/ferramentas').send({ nome: 'API OpenAI', cobranca: 'creditos' })).body;
    await ctx.http.post(`/api/ferramentas/${api.id}/recargas`).send({ data: '2026-10-02', valor_centavos: 10000 }).expect(201);
    await ctx.http.post(`/api/ferramentas/${api.id}/recargas`).send({ data: '2026-10-15', valor_centavos: 5000 }).expect(201);
    await ctx.http.post(`/api/ferramentas/${api.id}/recargas`).send({ data: '2026-09-30', valor_centavos: 7000 }).expect(201);

    const outubro = await listar();
    expect(outubro.ferramentas.map((f) => [f.nome, f.gasto_mes_centavos])).toEqual([
      ['API OpenAI', 15000], ['Claude', 11000], ['Midjourney', 0],
    ]);
    expect(outubro.ferramentas.find((f) => f.nome === 'API OpenAI').ultima_recarga).toBe('2026-10-15');
    expect(outubro.total_mes_centavos).toBe(26000);
    expect((await listar('?mes=2026-09')).total_mes_centavos).toBe(18000);
    await ctx.http.get('/api/ferramentas?mes=setembro').expect(400);
  });

  it('lista e exclui recargas; mensalidade não aceita recarga', async () => {
    const api = (await ctx.http.post('/api/ferramentas').send({ nome: 'API OpenAI', cobranca: 'creditos' })).body;
    await ctx.http.post(`/api/ferramentas/${api.id}/recargas`).send({ data: '2026-09-01', valor_centavos: 100 });
    const nova = (await ctx.http.post(`/api/ferramentas/${api.id}/recargas`).send({ data: '2026-10-01', valor_centavos: 200 })).body;
    expect((await ctx.http.get(`/api/ferramentas/${api.id}/recargas`).expect(200)).body.map((r) => r.data)).toEqual(['2026-10-01', '2026-09-01']);
    await ctx.http.delete(`/api/ferramentas/recargas/${nova.id}`).expect(204);
    await ctx.http.delete(`/api/ferramentas/recargas/${nova.id}`).expect(404);
    expect((await ctx.http.post(`/api/ferramentas/${api.id}/recargas`).send({ data: '2026-10-01' }).expect(400)).body.erros)
      .toEqual([{ campo: 'valor_centavos', mensagem: 'Obrigatório' }]);
    expect((await ctx.http.post('/api/ferramentas/1/recargas').send({ data: '2026-10-01', valor_centavos: 1 }).expect(409)).body.erro)
      .toBe('Só ferramentas de créditos têm recargas');
  });

  it('trocar para mensalidade exige valor; excluir leva as recargas junto', async () => {
    const api = (await ctx.http.post('/api/ferramentas').send({ nome: 'API OpenAI', cobranca: 'creditos' })).body;
    await ctx.http.post(`/api/ferramentas/${api.id}/recargas`).send({ data: '2026-10-01', valor_centavos: 100 });
    expect((await ctx.http.put(`/api/ferramentas/${api.id}`).send({ cobranca: 'mensalidade' }).expect(400)).body.erros)
      .toEqual([{ campo: 'valor_centavos', mensagem: 'Obrigatório' }]);
    await ctx.http.delete(`/api/ferramentas/${api.id}`).expect(204);
    await ctx.http.delete(`/api/ferramentas/${api.id}`).expect(404);
    expect(ctx.db.prepare('SELECT COUNT(*) AS n FROM ferramentas_recargas').get().n).toBe(0);
  });
});
