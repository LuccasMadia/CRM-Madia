import { describe, it, expect, beforeEach } from 'vitest';
import { criarContexto } from '../test/contexto.js';

let ctx;
beforeEach(() => {
  ctx = criarContexto({ hoje: '2026-09-23' });
});

describe('conteudos', () => {
  it('cria solto, com status padrão ideia', async () => {
    const res = await ctx.http.post('/api/conteudos').send({ titulo: 'Post', canal: 'instagram', tipo: 'post' }).expect(201);
    expect(res.body).toMatchObject({ status: 'ideia', projeto_id: null, projeto_titulo: null });
  });

  it('liga a um projeto e filtra por canal e projeto', async () => {
    const cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
    const projeto = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Site' })).body;
    await ctx.http.post('/api/conteudos').send({ titulo: 'Case', canal: 'portfolio', tipo: 'atualizacao', projeto_id: projeto.id }).expect(201);
    await ctx.http.post('/api/conteudos').send({ titulo: 'Post', canal: 'instagram', tipo: 'reels' });
    expect((await ctx.http.get('/api/conteudos?canal=portfolio')).body.map((c) => c.titulo)).toEqual(['Case']);
    const doProjeto = (await ctx.http.get(`/api/conteudos?projeto_id=${projeto.id}`)).body;
    expect(doProjeto[0].projeto_titulo).toBe('Site');
  });

  it('valida canal, tipo e projeto inexistente', async () => {
    const res = await ctx.http.post('/api/conteudos').send({ titulo: 'X', canal: 'tiktok', tipo: 'post', projeto_id: 999 }).expect(400);
    expect(res.body.erros.map((e) => e.campo)).toEqual(['canal']);
    const res2 = await ctx.http.post('/api/conteudos').send({ titulo: 'X', canal: 'instagram', tipo: 'post', projeto_id: 999 }).expect(400);
    expect(res2.body.erros).toEqual([{ campo: 'projeto_id', mensagem: 'Projeto não encontrado' }]);
  });

  it('ao publicar preenche data_publicada', async () => {
    const c = (await ctx.http.post('/api/conteudos').send({ titulo: 'Post', canal: 'instagram', tipo: 'post' })).body;
    const res = await ctx.http.put(`/api/conteudos/${c.id}`).send({ status: 'publicado' }).expect(200);
    expect(res.body.data_publicada).toBe('2026-09-23');
    await ctx.http.delete(`/api/conteudos/${c.id}`).expect(204);
  });
});
