import { describe, it, expect, beforeEach } from 'vitest';
import { criarContexto } from '../test/contexto.js';

let ctx;
let projeto;
beforeEach(async () => {
  ctx = criarContexto();
  const cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
  projeto = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Site' })).body;
});

const url = () => `/api/projetos/${projeto.id}/tarefas`;

describe('tarefas', () => {
  it('cria no fim da lista, conclui e reordena', async () => {
    const a = (await ctx.http.post(url()).send({ texto: 'A' }).expect(201)).body;
    const b = (await ctx.http.post(url()).send({ texto: 'B', prazo: '2026-09-30' }).expect(201)).body;
    expect([a.ordem, b.ordem]).toEqual([0, 1]);

    const concluida = await ctx.http.put(`/api/tarefas/${a.id}`).send({ concluida: true }).expect(200);
    expect(concluida.body.concluida).toBe(1);

    await ctx.http.put(`${url()}/ordem`).send({ ids: [b.id, a.id] }).expect(200);
    expect((await ctx.http.get(url())).body.map((t) => t.texto)).toEqual(['B', 'A']);
  });

  it('recusa reordenação com ids faltando ou de outro projeto', async () => {
    const a = (await ctx.http.post(url()).send({ texto: 'A' })).body;
    await ctx.http.post(url()).send({ texto: 'B' });
    const res = await ctx.http.put(`${url()}/ordem`).send({ ids: [a.id] }).expect(400);
    expect(res.body.erros[0].campo).toBe('ids');
    await ctx.http.put(`${url()}/ordem`).send({}).expect(400);
  });

  it('exige texto e exclui', async () => {
    await ctx.http.post(url()).send({ texto: '' }).expect(400);
    const a = (await ctx.http.post(url()).send({ texto: 'A' })).body;
    await ctx.http.delete(`/api/tarefas/${a.id}`).expect(204);
    await ctx.http.delete(`/api/tarefas/${a.id}`).expect(404);
  });
});
