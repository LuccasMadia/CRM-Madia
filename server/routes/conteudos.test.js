import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { criarContexto } from '../test/contexto.js';
import { openDb, migrate } from '../db/connection.js';

let ctx;
beforeEach(() => {
  ctx = criarContexto({ hoje: '2026-09-23' });
});

const criar = (corpo) => ctx.http.post('/api/conteudos').send(corpo);
const titulosProntos = async () => (await ctx.http.get('/api/conteudos?estado=pronto')).body.map((c) => c.titulo);
const enviarArte = (id) =>
  ctx.http.post(`/api/conteudos/${id}/arte`).attach('arte', Buffer.from('png'), { filename: 'a.png', contentType: 'image/png' });

describe('conteudos', () => {
  it('cria rascunho por padrão, sem canal', async () => {
    const res = await criar({ titulo: 'Reels', tipo: 'reels' }).expect(201);
    expect(res.body).toMatchObject({ estado: 'rascunho', projeto_id: null, projeto_titulo: null, arte: null, midia_id: null });
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

  it('envia e remove a arte, apagando o arquivo', async () => {
    const c = (await criar({ titulo: 'A', tipo: 'post' })).body;
    const res = await enviarArte(c.id).expect(200);
    const arquivo = path.join(ctx.dataDir, 'uploads', res.body.arte);
    expect(existsSync(arquivo)).toBe(true);
    const troca = await enviarArte(c.id).expect(200);
    expect(existsSync(arquivo)).toBe(false);
    const novo = path.join(ctx.dataDir, 'uploads', troca.body.arte);
    const sem = await ctx.http.delete(`/api/conteudos/${c.id}/arte`).expect(200);
    expect(sem.body.arte).toBeNull();
    expect(existsSync(novo)).toBe(false);
  });

  it('excluir apaga a arte', async () => {
    const c = (await criar({ titulo: 'A', tipo: 'post' })).body;
    const arquivo = path.join(ctx.dataDir, 'uploads', (await enviarArte(c.id)).body.arte);
    await ctx.http.delete(`/api/conteudos/${c.id}`).expect(204);
    expect(existsSync(arquivo)).toBe(false);
    await ctx.http.delete(`/api/conteudos/${c.id}`).expect(404);
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
