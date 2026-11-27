import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { criarContexto } from '../test/contexto.js';
import { googleFalso } from '../test/googleFalso.js';
import { obterConfig } from '../repos/config.js';

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const TOKEN = 'https://oauth2.googleapis.com/token';
const REVOGAR = 'https://oauth2.googleapis.com/revoke';
const CHAVES = ['gmail_client_id', 'gmail_client_secret', 'gmail_refresh_token', 'gmail_usuario'];

const conversa = (id) => ({
  id, snippet: 'Oi',
  messages: [{ payload: { headers: [{ name: 'Subject', value: 'Proposta' }, { name: 'From', value: 'Ana <ana@cliente.com>' }, { name: 'Date', value: 'Tue, 10 Mar 2026 09:00:00 -0300' }] } }],
});

let ctx;
let google;
let cliente;
async function montar(rotas = {}) {
  google = googleFalso({
    [`POST ${TOKEN}`]: ({ corpo }) => (corpo.get('grant_type') === 'authorization_code' ? { refresh_token: 'refresh-segredo', access_token: 'acesso-1' } : { access_token: 'acesso-2' }),
    [`POST ${REVOGAR}`]: {},
    [`GET ${GMAIL}/profile`]: { emailAddress: 'eu@gmail.com' },
    [`GET ${GMAIL}/threads`]: { threads: [{ id: 't1' }] },
    [`GET ${GMAIL}/threads/t1`]: conversa('t1'),
    ...rotas,
  });
  ctx = criarContexto({ fetch: google.fetch });
  cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Ana', email: 'ana@cliente.com' }).expect(201)).body;
}
const credenciais = () => ctx.http.put('/api/gmail/credenciais').send({ client_id: 'meu-id', client_secret: 'meu-segredo' }).expect(200);
async function conectar() {
  await credenciais();
  const destino = new URL((await ctx.http.get('/api/gmail/autorizar').expect(302)).headers.location);
  await ctx.http.get(`/api/gmail/callback?code=cod&state=${destino.searchParams.get('state')}`).expect(302);
}
const buscasDeThreads = () => google.requisicoes.filter((r) => r.url.pathname.endsWith('/threads')).length;

beforeEach(() => montar());
afterEach(() => vi.useRealTimers());

describe('conexão com o Gmail', () => {
  it('começa sem configuração e as credenciais nunca aparecem em respostas', async () => {
    expect((await ctx.http.get('/api/gmail').expect(200)).body).toEqual({ configurado: false, conectado: false, usuario: null });
    const salvo = (await credenciais()).body;
    expect(salvo).toEqual({ configurado: true, conectado: false, usuario: null });
    expect(JSON.stringify((await ctx.http.get('/api/gmail')).body)).not.toContain('meu-segredo');
    expect(JSON.stringify((await ctx.http.get('/api/config')).body)).not.toContain('meu-segredo');
  });

  it('credenciais vazias são recusadas', async () => {
    await ctx.http.put('/api/gmail/credenciais').send({ client_id: '', client_secret: 'x' }).expect(400);
    await ctx.http.put('/api/gmail/credenciais').send({ client_id: 'x' }).expect(400);
  });

  it('autorizar sem credenciais dá 409', async () => {
    const res = await ctx.http.get('/api/gmail/autorizar').expect(409);
    expect(res.body.erro).toBe('Informe o Client ID e o Client Secret primeiro.');
  });

  it('autorizar redireciona ao Google com state e o redirecionamento local', async () => {
    await credenciais();
    const res = await ctx.http.get('/api/gmail/autorizar').expect(302);
    const url = new URL(res.headers.location);
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe('meu-id');
    expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:5174/api/gmail/callback');
    expect(url.searchParams.get('state')).toBeTruthy();
  });

  it('callback válido guarda o refresh token e o usuário e volta para as Configurações', async () => {
    await credenciais();
    const state = new URL((await ctx.http.get('/api/gmail/autorizar')).headers.location).searchParams.get('state');
    const res = await ctx.http.get(`/api/gmail/callback?code=cod&state=${state}`).expect(302);
    expect(res.headers.location).toBe('/configuracoes');
    expect(obterConfig(ctx.db, 'gmail_refresh_token')).toBe('refresh-segredo');
    expect((await ctx.http.get('/api/gmail')).body).toEqual({ configurado: true, conectado: true, usuario: 'eu@gmail.com' });
    expect(JSON.stringify((await ctx.http.get('/api/gmail')).body)).not.toContain('refresh-segredo');
  });

  it('state desconhecido, repetido ou expirado é recusado e nada é salvo', async () => {
    await credenciais();
    await ctx.http.get('/api/gmail/callback?code=cod&state=inventado').expect(400);
    expect(obterConfig(ctx.db, 'gmail_refresh_token')).toBeFalsy();

    const state = new URL((await ctx.http.get('/api/gmail/autorizar')).headers.location).searchParams.get('state');
    await ctx.http.get(`/api/gmail/callback?code=cod&state=${state}`).expect(302);
    await ctx.http.delete('/api/gmail/conexao').expect(200);
    await credenciais();
    await ctx.http.get(`/api/gmail/callback?code=cod&state=${state}`).expect(400);
    expect(obterConfig(ctx.db, 'gmail_refresh_token')).toBeFalsy();

    vi.useFakeTimers({ toFake: ['Date'] });
    const velho = new URL((await ctx.http.get('/api/gmail/autorizar')).headers.location).searchParams.get('state');
    vi.setSystemTime(Date.now() + 11 * 60 * 1000);
    await ctx.http.get(`/api/gmail/callback?code=cod&state=${velho}`).expect(400);
    expect(obterConfig(ctx.db, 'gmail_refresh_token')).toBeFalsy();
  });

  it('desconectar revoga o token e apaga as quatro chaves', async () => {
    await conectar();
    await ctx.http.delete('/api/gmail/conexao').expect(200);
    expect(google.requisicoes.find((r) => r.url.href === REVOGAR).corpo.get('token')).toBe('refresh-segredo');
    for (const chave of CHAVES) expect(obterConfig(ctx.db, chave)).toBeFalsy();
    expect((await ctx.http.get('/api/gmail')).body).toEqual({ configurado: false, conectado: false, usuario: null });
  });

  it('desconectar funciona mesmo se o Google não responder', async () => {
    await montar({ [`POST ${REVOGAR}`]: { status: 500, corpo: {} } });
    await conectar();
    await ctx.http.delete('/api/gmail/conexao').expect(200);
    expect(obterConfig(ctx.db, 'gmail_refresh_token')).toBeFalsy();
  });

  it('o backup não leva as chaves gmail_*', async () => {
    const { copiarBanco } = await import('./backup.js');
    const { DatabaseSync } = await import('node:sqlite');
    const { rmSync } = await import('node:fs');
    await conectar();
    const copia = copiarBanco(ctx.db);
    try {
      const lida = new DatabaseSync(copia, { readOnly: true });
      const chaves = lida.prepare('SELECT chave FROM config').all().map((r) => r.chave);
      lida.close();
      for (const chave of CHAVES) expect(chaves).not.toContain(chave);
    } finally {
      rmSync(copia, { force: true });
    }
  });
});

describe('GET /clientes/:id/emails', () => {
  it('sem conexão dá 409', async () => {
    const res = await ctx.http.get(`/api/clientes/${cliente.id}/emails`).expect(409);
    expect(res.body.erro).toBe('Conecte o Gmail em Configurações.');
  });

  it('cliente inexistente dá 404', async () => {
    await conectar();
    await ctx.http.get('/api/clientes/9999/emails').expect(404);
  });

  it('cliente sem e-mail devolve semEmail e não chama o Gmail', async () => {
    await conectar();
    const sem = (await ctx.http.post('/api/clientes').send({ nome: 'Bia' }).expect(201)).body;
    const antes = google.requisicoes.length;
    expect((await ctx.http.get(`/api/clientes/${sem.id}/emails`).expect(200)).body).toEqual({ conversas: [], semEmail: true });
    expect(google.requisicoes.length).toBe(antes);
  });

  it('lista as conversas do cliente', async () => {
    await conectar();
    const res = await ctx.http.get(`/api/clientes/${cliente.id}/emails`).expect(200);
    expect(res.body.semEmail).toBe(false);
    expect(res.body.conversas).toEqual([
      { id: 't1', assunto: 'Proposta', trecho: 'Oi', data: '2026-03-10T12:00:00.000Z', de: 'Ana', link: 'https://mail.google.com/mail/u/0/#all/t1' },
    ]);
  });

  it('usa cache por 5 minutos e atualizar=1 ignora o cache', async () => {
    await conectar();
    await ctx.http.get(`/api/clientes/${cliente.id}/emails`).expect(200);
    await ctx.http.get(`/api/clientes/${cliente.id}/emails`).expect(200);
    expect(buscasDeThreads()).toBe(1);
    await ctx.http.get(`/api/clientes/${cliente.id}/emails?atualizar=1`).expect(200);
    expect(buscasDeThreads()).toBe(2);
  });

  it('refresh token revogado dá 502 com o chamado para reconectar', async () => {
    await conectar();
    await montar({ [`POST ${TOKEN}`]: { status: 400, corpo: { error: 'invalid_grant' } } });
    await ctx.http.put('/api/gmail/credenciais').send({ client_id: 'a', client_secret: 'b' }).expect(200);
    ctx.db.prepare("INSERT INTO config (chave, valor) VALUES ('gmail_refresh_token', 'morto')").run();
    const res = await ctx.http.get(`/api/clientes/${cliente.id}/emails`).expect(502);
    expect(res.body.erro).toBe('Gmail desconectado. Conecte de novo em Configurações → Gmail.');
  });

  it('access token vencido é renovado uma vez e a leitura segue', async () => {
    let primeira = true;
    await montar({
      [`GET ${GMAIL}/threads`]: () => {
        if (primeira) { primeira = false; return { status: 401, corpo: {} }; }
        return { threads: [{ id: 't1' }] };
      },
    });
    await conectar();
    const res = await ctx.http.get(`/api/clientes/${cliente.id}/emails`).expect(200);
    expect(res.body.conversas).toHaveLength(1);
  });
});
