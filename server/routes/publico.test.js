import { describe, it, expect, beforeEach } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { criarContexto } from '../test/contexto.js';

const TOKEN = 'a'.repeat(48);
const BYTES = Buffer.from([1, 2, 3, 4, 5, 250]);

function criarConteudo(db, { estado = 'publicando', token = TOKEN, arquivo = 'foto.jpg' } = {}) {
  const { lastInsertRowid: id } = db
    .prepare("INSERT INTO conteudos (tipo, titulo, estado, publicacao_token, criado_em, atualizado_em) VALUES ('post', 'P', ?, ?, 'x', 'x')")
    .run(estado, token);
  db.prepare("INSERT INTO conteudo_midias (conteudo_id, arquivo, tipo, ordem) VALUES (?, ?, 'imagem', 0)").run(id, arquivo);
  return id;
}

const binario = (res, cb) => {
  const partes = [];
  res.on('data', (d) => partes.push(d));
  res.on('end', () => cb(null, Buffer.concat(partes)));
};

describe('GET /publico/midia/:token/:arquivo', () => {
  let ctx;
  beforeEach(() => {
    ctx = criarContexto();
    mkdirSync(path.join(ctx.dataDir, 'uploads'), { recursive: true });
    writeFileSync(path.join(ctx.dataDir, 'uploads', 'foto.jpg'), BYTES);
    writeFileSync(path.join(ctx.dataDir, 'uploads', 'outra.jpg'), BYTES);
  });
  const get = (url, host = 'crm.luccasmadia.com.br') => request(ctx.app).get(url).set('Host', host);

  it('serve os bytes com token certo e estado publicando, em qualquer Host', async () => {
    criarConteudo(ctx.db);
    for (const host of ['crm.luccasmadia.com.br', '127.0.0.1', 'qualquer.exemplo.com']) {
      const r = await get(`/publico/midia/${TOKEN}/foto.jpg`, host).buffer(true).parse(binario);
      expect(r.status).toBe(200);
      expect(r.body.equals(BYTES)).toBe(true);
      expect(r.headers['cache-control']).toBe('no-store');
    }
  });

  it('404 vazio com token errado', async () => {
    criarConteudo(ctx.db);
    const r = await get(`/publico/midia/${'b'.repeat(48)}/foto.jpg`);
    expect(r.status).toBe(404);
    expect(r.text).toBe('');
  });

  it('404 quando o estado nao e publicando', async () => {
    criarConteudo(ctx.db, { estado: 'publicado' });
    expect((await get(`/publico/midia/${TOKEN}/foto.jpg`)).status).toBe(404);
  });

  it('404 para arquivo de outro conteudo ou fora do banco', async () => {
    criarConteudo(ctx.db);
    criarConteudo(ctx.db, { token: 'c'.repeat(48), arquivo: 'outra.jpg' });
    expect((await get(`/publico/midia/${TOKEN}/outra.jpg`)).status).toBe(404);
    expect((await get(`/publico/midia/${TOKEN}/inexistente.jpg`)).status).toBe(404);
  });

  it('404 com tentativa de path traversal', async () => {
    criarConteudo(ctx.db);
    for (const nome of ['..', '%2e%2e%2ffoto.jpg', '..%5cfoto.jpg', 'a%2Fb.jpg']) {
      const r = await get(`/publico/midia/${TOKEN}/${nome}`);
      expect(r.status).toBe(404);
      expect(r.text).toBe('');
    }
  });

  it('404 vazio para outros metodos e rotas em /publico', async () => {
    criarConteudo(ctx.db);
    expect((await request(ctx.app).post(`/publico/midia/${TOKEN}/foto.jpg`).set('Host', 'crm.luccasmadia.com.br')).status).toBe(404);
    expect((await request(ctx.app).delete(`/publico/midia/${TOKEN}/foto.jpg`)).status).toBe(404);
    const r = await get('/publico/qualquer');
    expect(r.status).toBe(404);
    expect(r.text).toBe('');
  });
});
