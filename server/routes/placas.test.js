import { describe, it, expect, beforeEach } from 'vitest';
import { criarContexto } from '../test/contexto.js';

let ctx;
beforeEach(() => {
  ctx = criarContexto();
});

async function criarMaterial(overrides = {}) {
  return (await ctx.http.post('/api/placas/materiais').send({ nome: 'Placa 10x10 PVC', ...overrides }).expect(201)).body;
}

describe('/api/placas/materiais', () => {
  it('cria e lista com estoque zerado e sem custo', async () => {
    await criarMaterial();
    const res = await ctx.http.get('/api/placas/materiais').expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ nome: 'Placa 10x10 PVC', estoque_atual: 0, custo_unitario_atual: null });
  });

  it('exige nome', async () => {
    const res = await ctx.http.post('/api/placas/materiais').send({}).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'nome', mensagem: 'Obrigatório' }]);
  });

  it('atualiza o nome', async () => {
    const material = await criarMaterial();
    const res = await ctx.http.put(`/api/placas/materiais/${material.id}`).send({ nome: 'Placa PVC 10x10' }).expect(200);
    expect(res.body.nome).toBe('Placa PVC 10x10');
  });

  it('responde 404 ao atualizar id inexistente', async () => {
    await ctx.http.put('/api/placas/materiais/999').send({ nome: 'X' }).expect(404);
  });

  it('exclui material sem vínculo', async () => {
    const material = await criarMaterial();
    await ctx.http.delete(`/api/placas/materiais/${material.id}`).expect(204);
    const res = await ctx.http.get('/api/placas/materiais').expect(200);
    expect(res.body).toEqual([]);
  });

  it('responde 404 ao excluir id inexistente', async () => {
    await ctx.http.delete('/api/placas/materiais/999').expect(404);
  });
});

async function criarLote(materialId, overrides = {}) {
  return (await ctx.http.post('/api/placas/lotes').send({
    material_id: materialId, quantidade: 10, valor_kit_centavos: 2490, valor_frete_centavos: 0,
    data_compra: '2026-09-01', ...overrides,
  }).expect(201)).body;
}

describe('/api/placas/lotes', () => {
  it('cria e lista, calculando custo e estoque do material', async () => {
    const material = await criarMaterial();
    await criarLote(material.id);
    const res = await ctx.http.get('/api/placas/materiais').expect(200);
    expect(res.body[0]).toMatchObject({ estoque_atual: 10, custo_unitario_atual: 249 });
  });

  it('aceita frete zero quando o campo não é informado', async () => {
    const material = await criarMaterial();
    const res = await ctx.http.post('/api/placas/lotes').send({
      material_id: material.id, quantidade: 10, valor_kit_centavos: 2490, data_compra: '2026-09-01',
    }).expect(201);
    expect(res.body.valor_frete_centavos).toBe(0);
  });

  it('recusa material_id inexistente', async () => {
    const res = await ctx.http.post('/api/placas/lotes').send({
      material_id: 999, quantidade: 10, valor_kit_centavos: 2490, data_compra: '2026-09-01',
    }).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'material_id', mensagem: 'Material não encontrado' }]);
  });

  it('filtra por material_id', async () => {
    const material = await criarMaterial();
    const outro = await criarMaterial({ nome: 'Adesivo 10x10' });
    const lote = await criarLote(material.id);
    await criarLote(outro.id);
    const res = await ctx.http.get(`/api/placas/lotes?material_id=${material.id}`).expect(200);
    expect(res.body.map((l) => l.id)).toEqual([lote.id]);
  });

  it('atualiza valores', async () => {
    const material = await criarMaterial();
    const lote = await criarLote(material.id);
    const res = await ctx.http.put(`/api/placas/lotes/${lote.id}`).send({ valor_frete_centavos: 500 }).expect(200);
    expect(res.body.valor_frete_centavos).toBe(500);
  });

  it('exclui o lote', async () => {
    const material = await criarMaterial();
    const lote = await criarLote(material.id);
    await ctx.http.delete(`/api/placas/lotes/${lote.id}`).expect(204);
    const res = await ctx.http.get('/api/placas/materiais').expect(200);
    expect(res.body[0].estoque_atual).toBe(0);
  });

  it('responde 404 ao excluir id inexistente', async () => {
    await ctx.http.delete('/api/placas/lotes/999').expect(404);
  });
});

describe('/api/placas/materiais exclusão bloqueada por lote', () => {
  it('não exclui material com lote vinculado', async () => {
    const material = await criarMaterial();
    await criarLote(material.id);
    const res = await ctx.http.delete(`/api/placas/materiais/${material.id}`).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'id', mensagem: 'Material tem lotes de compra vinculados' }]);
  });
});
