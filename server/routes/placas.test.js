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
