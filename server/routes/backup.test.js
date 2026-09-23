import { describe, it, expect } from 'vitest';
import { criarContexto } from '../test/contexto.js';

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
