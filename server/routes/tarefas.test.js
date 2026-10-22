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

describe('tarefas no quadro', () => {
  it('nasce em "a fazer" e a etapa acompanha o concluída nos dois sentidos', async () => {
    const a = (await ctx.http.post(url()).send({ texto: 'A' })).body;
    expect([a.etapa, a.concluida]).toEqual(['a_fazer', 0]);

    const aguardando = (await ctx.http.put(`/api/tarefas/${a.id}`).send({ etapa: 'aguardando_cliente' }).expect(200)).body;
    expect([aguardando.etapa, aguardando.concluida]).toEqual(['aguardando_cliente', 0]);

    const feita = (await ctx.http.put(`/api/tarefas/${a.id}`).send({ etapa: 'concluido' })).body;
    expect(feita.concluida).toBe(1);

    const reaberta = (await ctx.http.put(`/api/tarefas/${a.id}`).send({ concluida: false })).body;
    expect([reaberta.etapa, reaberta.concluida]).toEqual(['a_fazer', 0]);

    await ctx.http.put(`/api/tarefas/${a.id}`).send({ etapa: 'fazendo' });
    const soTexto = (await ctx.http.put(`/api/tarefas/${a.id}`).send({ texto: 'A2', concluida: false })).body;
    expect(soTexto.etapa).toBe('fazendo');

    await ctx.http.put(`/api/tarefas/${a.id}`).send({ etapa: 'outra' }).expect(400);
    await ctx.http.put('/api/tarefas/999').send({ etapa: 'fazendo' }).expect(404);
  });

  it('ao mudar de coluna vai para o fim dela; sobe e desce só entre as da mesma coluna', async () => {
    const criar = async (texto, etapa) => (await ctx.http.post(url()).send({ texto, etapa })).body;
    const t1 = await criar('T1', 'fazendo');
    const t2 = await criar('T2');
    const t3 = await criar('T3', 'fazendo');
    await criar('T4');

    await ctx.http.put(`/api/tarefas/${t2.id}`).send({ etapa: 'fazendo' });
    const daColuna = async (etapa) => (await ctx.http.get(url())).body.filter((t) => t.etapa === etapa).map((t) => t.texto);
    expect(await daColuna('fazendo')).toEqual(['T1', 'T3', 'T2']);

    await ctx.http.put(`/api/tarefas/${t2.id}/posicao`).send({ direcao: 'cima' }).expect(200);
    expect(await daColuna('fazendo')).toEqual(['T1', 'T2', 'T3']);
    await ctx.http.put(`/api/tarefas/${t1.id}/posicao`).send({ direcao: 'cima' }).expect(200);
    await ctx.http.put(`/api/tarefas/${t3.id}/posicao`).send({ direcao: 'baixo' }).expect(200);
    expect(await daColuna('fazendo')).toEqual(['T1', 'T2', 'T3']);
    expect(await daColuna('a_fazer')).toEqual(['T4']);

    await ctx.http.put(`/api/tarefas/${t1.id}/posicao`).send({ direcao: 'lado' }).expect(400);
    await ctx.http.put('/api/tarefas/999/posicao').send({ direcao: 'cima' }).expect(404);
  });

  it('quadro geral traz o nome do projeto, filtra por projeto e deixa de fora os perdidos', async () => {
    const cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Bia' })).body;
    const outro = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'App' })).body;
    const perdido = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Perdido', etapa: 'perdido' })).body;
    await ctx.http.post(url()).send({ texto: 'Do site' });
    await ctx.http.post(`/api/projetos/${outro.id}/tarefas`).send({ texto: 'Do app', etapa: 'fazendo' });
    await ctx.http.post(`/api/projetos/${perdido.id}/tarefas`).send({ texto: 'Some' });

    const todas = (await ctx.http.get('/api/tarefas').expect(200)).body;
    expect(todas.map((t) => [t.cliente_nome, t.projeto_titulo, t.texto, t.etapa])).toEqual([
      ['Bia', 'App', 'Do app', 'fazendo'],
      ['Ana', 'Site', 'Do site', 'a_fazer'],
    ]);
    const filtradas = (await ctx.http.get(`/api/tarefas?projeto_id=${outro.id}`)).body;
    expect(filtradas.map((t) => t.texto)).toEqual(['Do app']);
  });
});
