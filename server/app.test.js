import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { openDb } from './db/connection.js';
import { criarApp } from './app.js';

function criarComDist() {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), 'crm-teste-'));
  const distDir = mkdtempSync(path.join(os.tmpdir(), 'crm-dist-'));
  writeFileSync(path.join(distDir, 'index.html'), '<p>crm</p>');
  const app = criarApp({ db: openDb(':memory:'), dataDir, distDir });
  return request(app);
}

describe('front compilado', () => {
  it('devolve o index.html para rotas do front', async () => {
    const res = await criarComDist().get('/conteudo');
    expect(res.status).toBe(200);
    expect(res.text).toContain('crm');
  });

  it('serve o index.html na raiz', async () => {
    const res = await criarComDist().get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('crm');
  });

  it('mantém 404 JSON em /api inexistente', async () => {
    const res = await criarComDist().get('/api/inexistente').set('X-CRM', '1');
    expect(res.status).toBe(404);
    expect(res.body.erro).toBeTruthy();
  });

  it('não devolve o index.html para /publico nem /uploads', async () => {
    const http = criarComDist();
    expect((await http.get('/publico/x')).text).not.toContain('crm');
    expect((await http.get('/uploads/nada.png')).text).not.toContain('crm');
  });

  it('sem distDir, não serve o front', async () => {
    const dataDir = mkdtempSync(path.join(os.tmpdir(), 'crm-teste-'));
    const res = await request(criarApp({ db: openDb(':memory:'), dataDir })).get('/conteudo');
    expect(res.status).toBe(404);
  });
});
