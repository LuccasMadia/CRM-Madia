import { describe, it, expect } from 'vitest';
import { rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { criarContexto } from '../test/contexto.js';
import { definirConfig } from '../repos/config.js';
import { copiarBanco } from './backup.js';

describe('GET /api/backup', () => {
  it('devolve um zip', async () => {
    const ctx = criarContexto();
    await ctx.http.post('/api/clientes').send({ nome: 'Ana' });
    const res = await ctx.http.get('/api/backup').buffer(true).parse((r, cb) => {
      const partes = [];
      r.on('data', (p) => partes.push(p));
      r.on('end', () => cb(null, Buffer.concat(partes)));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/zip/);
    expect(res.headers['content-disposition']).toMatch(/crm-madia-backup-2026-09-23\.zip/);
    expect(res.body.subarray(0, 2).toString()).toBe('PK');
  });
});

describe('copiarBanco', () => {
  it('a cópia do backup não leva o token do Instagram', () => {
    const { db } = criarContexto();
    definirConfig(db, 'instagram_token', 'segredo-123');
    definirConfig(db, 'instagram_token_expira_em', '2026-12-01T00:00:00.000Z');
    definirConfig(db, 'instagram_usuario', 'luccasmadia');
    const copia = copiarBanco(db);
    try {
      const lida = new DatabaseSync(copia, { readOnly: true });
      const chaves = lida.prepare("SELECT chave FROM config WHERE chave LIKE 'instagram_%'").all().map((r) => r.chave);
      lida.close();
      expect(chaves).toEqual(['instagram_usuario']);
    } finally {
      rmSync(copia, { force: true });
    }
    expect(db.prepare("SELECT valor FROM config WHERE chave = 'instagram_token'").get().valor).toBe('segredo-123');
  });
});
