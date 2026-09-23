import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { criarContexto } from '../test/contexto.js';

let ctx;
let projeto;
beforeEach(async () => {
  ctx = criarContexto();
  const cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
  projeto = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Site' })).body;
});

const base = () => `/api/projetos/${projeto.id}/portfolio`;
const enviarImagens = (...nomes) => {
  let req = ctx.http.post(`${base()}/imagens`);
  for (const nome of nomes) req = req.attach('imagens', Buffer.from(`conteudo-${nome}`), { filename: nome, contentType: 'image/png' });
  return req;
};

describe('portfolio do projeto', () => {
  it('cria o registro vazio no primeiro acesso', async () => {
    const res = await ctx.http.get(base()).expect(200);
    expect(res.body).toMatchObject({ projeto_id: projeto.id, publicar: false, stack: [], imagens: [], case_study: [] });
  });

  it('salva campos públicos e valida slug único', async () => {
    const res = await ctx.http
      .put(base())
      .send({ publicar: true, slug: 'meu-site', titulo_publico: 'Meu Site', stack: ['React', 'Vite'] })
      .expect(200);
    expect(res.body).toMatchObject({ publicar: true, slug: 'meu-site', stack: ['React', 'Vite'] });

    const cliente = (await ctx.http.post('/api/clientes').send({ nome: 'B' })).body;
    const outro = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Outro' })).body;
    const conflito = await ctx.http.put(`/api/projetos/${outro.id}/portfolio`).send({ slug: 'meu-site' }).expect(400);
    expect(conflito.body.erros).toEqual([{ campo: 'slug', mensagem: 'Já usado por outro projeto' }]);
  });

  it('recebe imagens, serve em /uploads e reordena', async () => {
    const res = await enviarImagens('a.png', 'b.png').expect(201);
    expect(res.body.imagens).toHaveLength(2);
    const [a, b] = res.body.imagens;
    await ctx.http.get(a.url).expect(200);
    const reordenado = await ctx.http.put(`${base()}/imagens/ordem`).send({ ids: [b.id, a.id] }).expect(200);
    expect(reordenado.body.imagens.map((i) => i.id)).toEqual([b.id, a.id]);
  });

  it('recusa formato não suportado', async () => {
    const res = await ctx.http
      .post(`${base()}/imagens`)
      .attach('imagens', Buffer.from('x'), { filename: 'a.txt', contentType: 'text/plain' })
      .expect(400);
    expect(res.body.erro).toMatch(/Formato não suportado/);
  });

  it('case study: cria slide com imagem do próprio projeto e recusa imagem de outro', async () => {
    const { imagens } = (await enviarImagens('a.png')).body;
    const res = await ctx.http.post(`${base()}/case-study`).send({ titulo: 'Home', imagem_id: imagens[0].id }).expect(201);
    expect(res.body.case_study).toHaveLength(1);

    const cliente = (await ctx.http.post('/api/clientes').send({ nome: 'B' })).body;
    const outro = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Outro' })).body;
    const erro = await ctx.http
      .post(`/api/projetos/${outro.id}/portfolio/case-study`)
      .send({ titulo: 'X', imagem_id: imagens[0].id })
      .expect(400);
    expect(erro.body.erros[0].campo).toBe('imagem_id');
  });

  it('não exclui imagem usada num slide (409) e exclui imagem livre, apagando o arquivo', async () => {
    const { imagens } = (await enviarImagens('a.png', 'b.png')).body;
    await ctx.http.post(`${base()}/case-study`).send({ titulo: 'Home', imagem_id: imagens[0].id });

    const bloqueio = await ctx.http.delete(`/api/portfolio/imagens/${imagens[0].id}`).expect(409);
    expect(bloqueio.body.erro).toMatch(/case study/);
    expect((await ctx.http.get(base())).body.imagens).toHaveLength(2);

    const res = await ctx.http.delete(`/api/portfolio/imagens/${imagens[1].id}`).expect(200);
    expect(res.body.imagens).toHaveLength(1);
    expect(existsSync(path.join(ctx.dataDir, 'uploads', imagens[1].arquivo))).toBe(false);
  });

  it('edita e exclui slide', async () => {
    const criado = (await ctx.http.post(`${base()}/case-study`).send({ titulo: 'Home' })).body;
    const slide = criado.case_study[0];
    const editado = await ctx.http.put(`/api/portfolio/case-study/${slide.id}`).send({ descricao: 'Tela inicial' }).expect(200);
    expect(editado.body.case_study[0]).toMatchObject({ titulo: 'Home', descricao: 'Tela inicial' });
    const removido = await ctx.http.delete(`/api/portfolio/case-study/${slide.id}`).expect(200);
    expect(removido.body.case_study).toEqual([]);
  });
});
