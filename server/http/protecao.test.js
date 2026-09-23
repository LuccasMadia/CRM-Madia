import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { criarContexto } from '../test/contexto.js';

describe('proteção contra outros sites', () => {
  it('recusa escrita sem o cabeçalho X-CRM (formulário de outro site)', async () => {
    const { app } = criarContexto();
    const res = await request(app).post('/api/portfolio/publicar').expect(403);
    expect(res.body.erro).toMatch(/X-CRM/);
    await request(app).post('/api/clientes').send({ nome: 'Ana' }).expect(403);
  });

  it('aceita escrita com o cabeçalho X-CRM', async () => {
    const { app } = criarContexto();
    await request(app).post('/api/clientes').set('X-CRM', '1').send({ nome: 'Ana' }).expect(201);
  });

  it('recusa Host que não seja 127.0.0.1 ou localhost (DNS rebinding)', async () => {
    const { app } = criarContexto();
    await request(app).get('/api/backup').set('Host', 'site-malicioso.com').expect(403);
    await request(app).get('/api/painel').set('Host', 'localhost:5173').expect(200);
  });
});
