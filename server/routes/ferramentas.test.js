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
      expect.objectContaining({ nome: 'Claude', cobranca: 'mensalidade', valor_centavos: 0, cancelada_em: null, gasto_mes_centavos: 0 }),
    ]);
    expect(total_mes_centavos).toBe(0);
  });

  it('cria mensalidade e créditos; créditos não guardam valor nem dia', async () => {
    const mensal = (await ctx.http.post('/api/ferramentas')
      .send({ nome: ' Cursor ', cobranca: 'mensalidade', valor_centavos: 11000, dia_cobranca: 5 }).expect(201)).body;
    expect(mensal).toMatchObject({ nome: 'Cursor', valor_centavos: 11000, dia_cobranca: 5, cancelada_em: null });
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

  it('total do mês soma mensalidades não canceladas e recargas do mês', async () => {
    await ctx.http.put('/api/ferramentas/1').send({ valor_centavos: 11000 }).expect(200);
    const parada = (await ctx.http.post('/api/ferramentas').send({ nome: 'Midjourney', cobranca: 'mensalidade', valor_centavos: 5000 })).body;
    await ctx.http.post(`/api/ferramentas/${parada.id}/cancelar`).send({ data: '2026-09-10' }).expect(200);
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
    // Setembro: Claude + Midjourney (cancelada em setembro ainda conta) + recarga de setembro.
    expect((await listar('?mes=2026-09')).total_mes_centavos).toBe(23000);
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

  it('cancela a assinatura hoje (ou na data dada) e reativa; créditos não se cancelam', async () => {
    expect((await ctx.http.post('/api/ferramentas/1/cancelar').send({}).expect(200)).body.cancelada_em).toBe('2026-10-20');
    expect((await ctx.http.post('/api/ferramentas/1/cancelar').send({}).expect(409)).body.erro).toBe('Assinatura já cancelada');
    expect((await ctx.http.post('/api/ferramentas/1/reativar').expect(200)).body.cancelada_em).toBeNull();
    await ctx.http.post('/api/ferramentas/1/cancelar').send({ data: '20/10' }).expect(400);
    const api = (await ctx.http.post('/api/ferramentas').send({ nome: 'API OpenAI', cobranca: 'creditos' })).body;
    expect((await ctx.http.post(`/api/ferramentas/${api.id}/cancelar`).send({}).expect(409)).body.erro).toBe('Só mensalidades podem ser canceladas');
    await ctx.http.post('/api/ferramentas/99/cancelar').send({}).expect(404);
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
