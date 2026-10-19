import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { criarContexto } from '../test/contexto.js';
import { openDb, migrate } from '../db/connection.js';
import { MENSAGEM_CARROSSEL_VIDEO } from '../instagram/regrasPublicacao.js';

let ctx;
beforeEach(() => {
  ctx = criarContexto({ hoje: '2026-09-23' });
});

const criar = (corpo) => ctx.http.post('/api/conteudos').send(corpo);
const titulosProntos = async () => (await ctx.http.get('/api/conteudos?estado=pronto')).body.map((c) => c.titulo);

const png = () => sharp({ create: { width: 10, height: 10, channels: 3, background: '#ff0000' } }).png().toBuffer();
const mp4 = () => Buffer.from('video-falso');
const ilegivel = () => Buffer.from('nao-e-imagem');
const arquivosEmUploads = () => {
  const dir = path.join(ctx.dataDir, 'uploads');
  return existsSync(dir) ? readdirSync(dir) : [];
};
// Cada item é um Buffer: PNG real, o vídeo falso ou bytes que o sharp não consegue ler (declarados como PNG).
const enviarMidias = (id, arquivos) => {
  const req = ctx.http.post(`/api/conteudos/${id}/midias`);
  arquivos.forEach((buf, i) => {
    const video = buf.toString() === 'video-falso';
    req.attach('midias', buf, video ? { filename: `v${i}.mp4`, contentType: 'video/mp4' } : { filename: `a${i}.png`, contentType: 'image/png' });
  });
  return req;
};

describe('conteudos', () => {
  it('cria rascunho por padrão, sem canal', async () => {
    const res = await criar({ titulo: 'Reels', tipo: 'reels' }).expect(201);
    expect(res.body).toMatchObject({ estado: 'rascunho', projeto_id: null, projeto_titulo: null, midia_id: null, midias: [], capa_url: null });
    expect(res.body).not.toHaveProperty('canal');
  });

  it('rejeita tipo story e estado publicado', async () => {
    const res = await criar({ titulo: 'X', tipo: 'story', estado: 'publicado' }).expect(400);
    expect(res.body.erros.map((e) => e.campo).sort()).toEqual(['estado', 'tipo']);
  });

  it('valida projeto inexistente e filtra por projeto', async () => {
    const res = await criar({ titulo: 'X', tipo: 'post', projeto_id: 999 }).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'projeto_id', mensagem: 'Projeto não encontrado' }]);
    const cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
    const projeto = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Site' })).body;
    await criar({ titulo: 'Case', tipo: 'carrossel', projeto_id: projeto.id }).expect(201);
    await criar({ titulo: 'Solto', tipo: 'post' });
    const doProjeto = (await ctx.http.get(`/api/conteudos?projeto_id=${projeto.id}`)).body;
    expect(doProjeto.map((c) => [c.titulo, c.projeto_titulo])).toEqual([['Case', 'Site']]);
  });

  it('marcar pronto põe no fim da fila e reordenar troca a ordem', async () => {
    const a = (await criar({ titulo: 'A', tipo: 'post', estado: 'pronto' })).body;
    const b = (await criar({ titulo: 'B', tipo: 'post' })).body;
    expect(await titulosProntos()).toEqual(['A']);
    await ctx.http.put(`/api/conteudos/${b.id}`).send({ estado: 'pronto' }).expect(200);
    expect(await titulosProntos()).toEqual(['A', 'B']);
    await ctx.http.put('/api/conteudos/ordem').send({ ids: [b.id, a.id] }).expect(204);
    expect(await titulosProntos()).toEqual(['B', 'A']);
    await ctx.http.put('/api/conteudos/ordem').send({ ids: [b.id] }).expect(400);
  });

  it('voltar para rascunho e marcar pronto de novo vai para o fim', async () => {
    const a = (await criar({ titulo: 'A', tipo: 'post', estado: 'pronto' })).body;
    await criar({ titulo: 'B', tipo: 'post', estado: 'pronto' });
    await ctx.http.put(`/api/conteudos/${a.id}`).send({ estado: 'rascunho' }).expect(200);
    await ctx.http.put(`/api/conteudos/${a.id}`).send({ estado: 'pronto' }).expect(200);
    expect(await titulosProntos()).toEqual(['B', 'A']);
  });

  it('envia imagens convertidas para jpg e devolve as mídias em ordem', async () => {
    const c = (await criar({ titulo: 'A', tipo: 'carrossel' })).body;
    const res = await enviarMidias(c.id, [await png(), await png()]).expect(200);
    expect(res.body.midias).toHaveLength(2);
    expect(res.body.midias[0]).toMatchObject({ tipo: 'imagem', ordem: 0, largura: 10, altura: 10 });
    expect(res.body.midias[0].url).toMatch(/^\/uploads\/.+\.jpg$/);
    expect(res.body.midias[1].ordem).toBe(1);
    expect(res.body.capa_url).toBe(res.body.midias[0].url);
    const lista = (await ctx.http.get('/api/conteudos')).body;
    expect(lista[0].midias).toHaveLength(2);
    const mais = await enviarMidias(c.id, [await png()]).expect(200);
    expect(mais.body.midias.map((m) => m.ordem)).toEqual([0, 1, 2]);
  });

  it('rejeita vídeo em carrossel e não deixa arquivo no disco', async () => {
    const c = (await criar({ titulo: 'A', tipo: 'carrossel' })).body;
    const res = await enviarMidias(c.id, [await png(), mp4()]).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'midias', mensagem: MENSAGEM_CARROSSEL_VIDEO }]);
    expect(arquivosEmUploads()).toEqual([]);
  });

  it('rejeita vídeo em post e aceita vídeo em reels', async () => {
    const post = (await criar({ titulo: 'P', tipo: 'post' })).body;
    const res = await enviarMidias(post.id, [mp4()]).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'midias', mensagem: 'Post aceita só imagem.' }]);
    expect(arquivosEmUploads()).toEqual([]);
    const reels = (await criar({ titulo: 'R', tipo: 'reels' })).body;
    const ok = await enviarMidias(reels.id, [mp4()]).expect(200);
    expect(ok.body.midias[0]).toMatchObject({ tipo: 'video', largura: null });
  });

  it('rejeita imagem em reels e não deixa arquivo no disco', async () => {
    const reels = (await criar({ titulo: 'R', tipo: 'reels' })).body;
    const res = await enviarMidias(reels.id, [await png()]).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'midias', mensagem: 'Reels aceita só um vídeo.' }]);
    expect(arquivosEmUploads()).toEqual([]);
    const misturado = await enviarMidias(reels.id, [mp4(), await png()]).expect(400);
    expect(misturado.body.erros).toEqual([{ campo: 'midias', mensagem: 'Reels aceita só um vídeo.' }]);
  });

  it('imagem ilegível devolve 400 e limpa o que já tinha sido preparado', async () => {
    const c = (await criar({ titulo: 'A', tipo: 'carrossel' })).body;
    await enviarMidias(c.id, [await png(), ilegivel()]).expect(400);
    expect(arquivosEmUploads()).toEqual([]);
    expect((await ctx.http.get('/api/conteudos')).body[0].midias).toEqual([]);
  });

  it('sem arquivo devolve 400', async () => {
    const c = (await criar({ titulo: 'A', tipo: 'post' })).body;
    await ctx.http.post(`/api/conteudos/${c.id}/midias`).expect(400);
  });

  it('pelo host público o envio é recusado sem gravar nada', async () => {
    const c = (await criar({ titulo: 'A', tipo: 'post' })).body;
    const res = await enviarMidias(c.id, [await png()]).set('Host', 'crm.luccasmadia.com.br').expect(403);
    expect(res.body).toEqual({ erro: 'Suba a mídia pelo PC.' });
    expect(arquivosEmUploads()).toEqual([]);
  });

  it('remove uma mídia apagando o arquivo', async () => {
    const c = (await criar({ titulo: 'A', tipo: 'carrossel' })).body;
    const { midias } = (await enviarMidias(c.id, [await png(), await png()])).body;
    const arquivo = path.join(ctx.dataDir, 'uploads', path.basename(midias[0].url));
    const res = await ctx.http.delete(`/api/conteudos/${c.id}/midias/${midias[0].id}`).expect(200);
    expect(res.body.midias.map((m) => m.id)).toEqual([midias[1].id]);
    expect(existsSync(arquivo)).toBe(false);
    await ctx.http.delete(`/api/conteudos/${c.id}/midias/${midias[0].id}`).expect(404);
  });

  it('reordena as mídias e recusa ids que não batem', async () => {
    const c = (await criar({ titulo: 'A', tipo: 'carrossel' })).body;
    const { midias } = (await enviarMidias(c.id, [await png(), await png()])).body;
    const [m1, m2] = midias.map((m) => m.id);
    const res = await ctx.http.put(`/api/conteudos/${c.id}/midias/ordem`).send({ ids: [m2, m1] }).expect(200);
    expect(res.body.midias.map((m) => m.id)).toEqual([m2, m1]);
    expect(res.body.capa_url).toBe(res.body.midias[0].url);
    await ctx.http.put(`/api/conteudos/${c.id}/midias/ordem`).send({ ids: [m1] }).expect(400);
    await ctx.http.put(`/api/conteudos/${c.id}/midias/ordem`).send({ ids: [m1, 999] }).expect(400);
  });

  it('excluir o conteúdo apaga os arquivos das mídias', async () => {
    const c = (await criar({ titulo: 'A', tipo: 'carrossel' })).body;
    await enviarMidias(c.id, [await png(), await png()]);
    expect(arquivosEmUploads()).toHaveLength(2);
    await ctx.http.delete(`/api/conteudos/${c.id}`).expect(204);
    expect(arquivosEmUploads()).toEqual([]);
    await ctx.http.delete(`/api/conteudos/${c.id}`).expect(404);
  });

  it('conteúdo publicando recusa qualquer escrita com 409', async () => {
    const c = (await criar({ titulo: 'A', tipo: 'carrossel' })).body;
    const { midias } = (await enviarMidias(c.id, [await png()])).body;
    ctx.db.prepare("UPDATE conteudos SET estado = 'publicando' WHERE id = ?").run(c.id);
    const base = `/api/conteudos/${c.id}`;
    await ctx.http.put(base).send({ titulo: 'B' }).expect(409);
    await ctx.http.delete(base).expect(409);
    await enviarMidias(c.id, [await png()]).expect(409);
    await ctx.http.delete(`${base}/midias/${midias[0].id}`).expect(409);
    const res = await ctx.http.put(`${base}/midias/ordem`).send({ ids: [midias[0].id] }).expect(409);
    expect(res.body).toEqual({ erro: 'Este post está sendo publicado.' });
    expect(arquivosEmUploads()).toHaveLength(1);
  });

  it('o grid devolve as mídias dos prontos', async () => {
    const c = (await criar({ titulo: 'A', tipo: 'post', estado: 'pronto' })).body;
    await enviarMidias(c.id, [await png()]);
    const { prontos } = (await ctx.http.get('/api/instagram/grid')).body;
    expect(prontos[0].midias).toHaveLength(1);
    expect(prontos[0].capa_url).toBe(prontos[0].midias[0].url);
  });

  it('não lista planejados já ligados a um post', async () => {
    const c = (await criar({ titulo: 'A', tipo: 'post', estado: 'pronto' })).body;
    ctx.db.prepare("INSERT INTO instagram_midias (id, tipo, publicado_em, atualizado_em) VALUES ('m1', 'post', '2026-09-24T10:00:00+0000', 'x')").run();
    ctx.db.prepare("UPDATE conteudos SET midia_id = 'm1' WHERE id = ?").run(c.id);
    expect((await ctx.http.get('/api/conteudos')).body).toEqual([]);
  });
});

describe('migração 016', () => {
  it('converte status antigos e guarda publicados como legado', () => {
    const db = openDb(':memory:', { ate: '015_projetos_servico.sql' });
    db.exec("INSERT INTO clientes (nome, criado_em, atualizado_em) VALUES ('Ana', 'x', 'x')");
    db.exec("INSERT INTO projetos (cliente_id, titulo, criado_em, atualizado_em) VALUES (1, 'Site', 'x', 'x')");
    const inserir = db.prepare(
      "INSERT INTO conteudos (projeto_id, canal, tipo, titulo, status, data_publicada, legenda, criado_em, atualizado_em) VALUES (?, 'instagram', ?, ?, ?, ?, ?, 'x', 'x')",
    );
    inserir.run(null, 'post', 'Ideia', 'ideia', null, null);
    inserir.run(null, 'story', 'Produzindo', 'produzindo', null, null);
    inserir.run(null, 'reels', 'Agendado', 'agendado', null, null);
    inserir.run(1, 'reels', 'Publicado', 'publicado', '2026-09-26', 'Tour pelo site');
    migrate(db);
    const conteudos = db.prepare('SELECT titulo, estado, tipo FROM conteudos ORDER BY id').all().map((r) => ({ ...r }));
    expect(conteudos).toEqual([
      { titulo: 'Ideia', estado: 'rascunho', tipo: 'post' },
      { titulo: 'Produzindo', estado: 'rascunho', tipo: 'post' },
      { titulo: 'Agendado', estado: 'pronto', tipo: 'reels' },
    ]);
    const legado = db.prepare('SELECT projeto_id, tipo, data_publicada, legenda FROM conteudos_legado').all().map((r) => ({ ...r }));
    expect(legado).toEqual([{ projeto_id: 1, tipo: 'reels', data_publicada: '2026-09-26', legenda: 'Tour pelo site' }]);
  });
});
