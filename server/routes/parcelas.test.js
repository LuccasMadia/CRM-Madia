import { describe, it, expect, beforeEach } from 'vitest';
import { criarContexto } from '../test/contexto.js';

let ctx;
let projeto;
beforeEach(async () => {
  ctx = criarContexto({ hoje: '2026-09-23' });
  const cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
  projeto = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Site', valor_total_centavos: 10000 })).body;
});

const nova = (dados) => ctx.http.post(`/api/projetos/${projeto.id}/parcelas`).send(dados);

describe('parcelas', () => {
  it('cria, lista com estado e resumo', async () => {
    await nova({ descricao: 'Entrada', valor_centavos: 5000, vencimento: '2026-09-10' }).expect(201);
    await nova({ descricao: 'Final', valor_centavos: 3000, vencimento: '2026-10-10' }).expect(201);
    const res = await ctx.http.get(`/api/projetos/${projeto.id}/parcelas`).expect(200);
    expect(res.body.parcelas.map((p) => p.estado)).toEqual(['atrasada', 'pendente']);
    expect(res.body.resumo).toMatchObject({ atrasado_centavos: 5000, pendente_centavos: 3000, nao_parcelado_centavos: 2000 });
  });

  it('valida valor positivo e vencimento', async () => {
    const res = await nova({ valor_centavos: 0 }).expect(400);
    expect(res.body.erros.map((e) => e.campo).sort()).toEqual(['valor_centavos', 'vencimento']);
  });

  it('marca como paga e desfaz', async () => {
    const p = (await nova({ valor_centavos: 5000, vencimento: '2026-09-10' })).body;
    expect((await ctx.http.put(`/api/parcelas/${p.id}`).send({ pago_em: '2026-09-23' }).expect(200)).body.estado).toBe('paga');
    expect((await ctx.http.put(`/api/parcelas/${p.id}`).send({ pago_em: null }).expect(200)).body.estado).toBe('atrasada');
  });

  it('lista geral filtra por estado e mês', async () => {
    await nova({ valor_centavos: 5000, vencimento: '2026-09-10' });
    await nova({ valor_centavos: 3000, vencimento: '2026-10-10' });
    const atrasadas = await ctx.http.get('/api/parcelas?estado=atrasada').expect(200);
    expect(atrasadas.body).toHaveLength(1);
    expect(atrasadas.body[0]).toMatchObject({ projeto_titulo: 'Site', cliente_nome: 'Ana' });
    expect((await ctx.http.get('/api/parcelas?mes=2026-10').expect(200)).body).toHaveLength(1);
    await ctx.http.get('/api/parcelas?mes=outubro').expect(400);
  });

  it('financeiro mensal soma o recebido', async () => {
    const p = (await nova({ valor_centavos: 5000, vencimento: '2026-09-10' })).body;
    await ctx.http.put(`/api/parcelas/${p.id}`).send({ pago_em: '2026-09-15' });
    const res = await ctx.http.get('/api/financeiro/mensal?ano=2026').expect(200);
    expect(res.body[8]).toEqual({ mes: '2026-09', recebido_centavos: 5000 });
  });

  it('exclui e 404 em projeto inexistente', async () => {
    const p = (await nova({ valor_centavos: 5000, vencimento: '2026-09-10' })).body;
    await ctx.http.delete(`/api/parcelas/${p.id}`).expect(204);
    await ctx.http.get('/api/projetos/999/parcelas').expect(404);
  });
});

describe('parcelamento em lote', () => {
  it('gera N parcelas mensais com descrição numerada', async () => {
    const res = await ctx.http
      .post(`/api/projetos/${projeto.id}/parcelas/lote`)
      .send({ quantidade: 3, valor_centavos: 50000, primeira_vencimento: '2026-04-10' })
      .expect(201);
    expect(res.body.map((p) => [p.descricao, p.vencimento, p.valor_centavos, p.estado])).toEqual([
      ['Parcela 1/3', '2026-04-10', 50000, 'atrasada'],
      ['Parcela 2/3', '2026-05-10', 50000, 'atrasada'],
      ['Parcela 3/3', '2026-06-10', 50000, 'atrasada'],
    ]);
    const lista = await ctx.http.get(`/api/projetos/${projeto.id}/parcelas`).expect(200);
    expect(lista.body.parcelas).toHaveLength(3);
  });

  it('ajusta parcelas para o fim do mês quando o dia não existe', async () => {
    const res = await ctx.http
      .post(`/api/projetos/${projeto.id}/parcelas/lote`)
      .send({ quantidade: 2, valor_centavos: 10000, primeira_vencimento: '2026-01-31' })
      .expect(201);
    expect(res.body.map((p) => p.vencimento)).toEqual(['2026-01-31', '2026-02-28']);
  });

  it('valida quantidade, valor e data', async () => {
    const res = await ctx.http
      .post(`/api/projetos/${projeto.id}/parcelas/lote`)
      .send({ quantidade: 0, valor_centavos: 0, primeira_vencimento: 'x' })
      .expect(400);
    expect(res.body.erros.map((e) => e.campo).sort()).toEqual(['primeira_vencimento', 'quantidade', 'valor_centavos']);
  });

  it('rejeita quantidade acima do limite', async () => {
    const res = await ctx.http
      .post(`/api/projetos/${projeto.id}/parcelas/lote`)
      .send({ quantidade: 61, valor_centavos: 100, primeira_vencimento: '2026-04-10' })
      .expect(400);
    expect(res.body.erros).toEqual([{ campo: 'quantidade', mensagem: 'Deve ser no máximo 60' }]);
  });

  it('404 em projeto inexistente', async () => {
    await ctx.http
      .post('/api/projetos/999/parcelas/lote')
      .send({ quantidade: 1, valor_centavos: 100, primeira_vencimento: '2026-04-10' })
      .expect(404);
  });
});
