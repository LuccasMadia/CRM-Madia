import { describe, it, expect } from 'vitest';
import { criarClienteGoogle, criarClienteGmail, ErroGmail } from './cliente.js';

// fetch falso: trata o corpo como texto (o Google recebe formulário, não JSON).
function falso(rotas) {
  const requisicoes = [];
  const fetch = async (entrada, init = {}) => {
    const url = new URL(String(entrada));
    const metodo = (init.method ?? 'GET').toUpperCase();
    const corpo = init.body === undefined ? null : new URLSearchParams(String(init.body));
    requisicoes.push({ url, metodo, corpo, headers: init.headers ?? {} });
    let r = rotas[`${metodo} ${url.origin}${url.pathname}`];
    if (typeof r === 'function') r = await r({ url, corpo });
    if (r === undefined) r = { status: 404, corpo: {} };
    const { status, corpo: json } = 'status' in r ? r : { status: 200, corpo: r };
    return new Response(JSON.stringify(json ?? {}), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return { fetch, requisicoes };
}

const GOOGLE = { clientId: 'cid', clientSecret: 'seg', redirectUri: 'http://127.0.0.1:5174/api/gmail/callback' };

describe('cliente do Google', () => {
  it('monta a URL de autorização com os parâmetros certos', () => {
    const url = new URL(criarClienteGoogle({ fetch: falso({}).fetch }).urlDeAutorizacao({ clientId: 'cid', redirectUri: GOOGLE.redirectUri, state: 'abc' }));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'cid', redirect_uri: GOOGLE.redirectUri, response_type: 'code', access_type: 'offline', prompt: 'consent',
      scope: 'https://www.googleapis.com/auth/gmail.readonly', state: 'abc',
    });
  });

  it('troca o código pelo refresh token', async () => {
    const { fetch, requisicoes } = falso({ 'POST https://oauth2.googleapis.com/token': { refresh_token: 'r1', access_token: 'a1' } });
    const dados = await criarClienteGoogle({ fetch }).trocarCodigo({ ...GOOGLE, codigo: 'cod' });
    expect(dados).toEqual({ refresh_token: 'r1', access_token: 'a1' });
    expect(Object.fromEntries(requisicoes[0].corpo)).toEqual({
      grant_type: 'authorization_code', code: 'cod', client_id: 'cid', client_secret: 'seg', redirect_uri: GOOGLE.redirectUri,
    });
  });

  it('invalid_grant marca como desconectado', async () => {
    const { fetch } = falso({ 'POST https://oauth2.googleapis.com/token': { status: 400, corpo: { error: 'invalid_grant' } } });
    await expect(criarClienteGoogle({ fetch }).renovar({ clientId: 'c', clientSecret: 's', refreshToken: 'r' }))
      .rejects.toMatchObject({ desconectado: true, status: 400 });
  });

  it('renova o access token', async () => {
    const { fetch, requisicoes } = falso({ 'POST https://oauth2.googleapis.com/token': { access_token: 'novo' } });
    expect(await criarClienteGoogle({ fetch }).renovar({ clientId: 'c', clientSecret: 's', refreshToken: 'r' })).toBe('novo');
    expect(requisicoes[0].corpo.get('grant_type')).toBe('refresh_token');
  });

  it('revoga o token', async () => {
    const { fetch, requisicoes } = falso({ 'POST https://oauth2.googleapis.com/revoke': {} });
    await criarClienteGoogle({ fetch }).revogar('r1');
    expect(requisicoes[0].corpo.get('token')).toBe('r1');
  });

  it('sem internet devolve a mensagem de rede', async () => {
    const fetch = async () => { throw new Error('ECONNRESET'); };
    await expect(criarClienteGoogle({ fetch }).renovar({ clientId: 'c', clientSecret: 's', refreshToken: 'r' }))
      .rejects.toThrow('Não foi possível falar com o Google. Verifique a internet.');
  });
});

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
const conversa = (id, assunto, de, data, trecho) => ({
  id, snippet: trecho,
  messages: [
    { payload: { headers: [{ name: 'Subject', value: 'antigo' }, { name: 'From', value: 'x@x.com' }, { name: 'Date', value: 'Mon, 1 Jan 2026 10:00:00 +0000' }] } },
    { payload: { headers: [{ name: 'Subject', value: assunto }, { name: 'From', value: de }, { name: 'Date', value: data }] } },
  ],
});

describe('cliente do Gmail', () => {
  it('usuario devolve o e-mail da conta', async () => {
    const { fetch, requisicoes } = falso({ [`GET ${BASE}/profile`]: { emailAddress: 'eu@gmail.com' } });
    expect(await criarClienteGmail({ accessToken: 'tok', fetch }).usuario()).toBe('eu@gmail.com');
    expect(requisicoes[0].headers.Authorization).toBe('Bearer tok');
  });

  it('lista as conversas do cliente, da mais recente para a mais antiga, com "Você" nos próprios envios', async () => {
    const { fetch, requisicoes } = falso({
      [`GET ${BASE}/profile`]: { emailAddress: 'eu@gmail.com' },
      [`GET ${BASE}/threads`]: { threads: [{ id: 't1' }, { id: 't2' }] },
      [`GET ${BASE}/threads/t1`]: conversa('t1', 'Proposta', 'Ana <ana@cliente.com>', 'Tue, 10 Mar 2026 09:00:00 -0300', 'Segue a proposta'),
      [`GET ${BASE}/threads/t2`]: conversa('t2', 'Re: Logo', 'Eu <eu@gmail.com>', 'Wed, 11 Mar 2026 09:00:00 -0300', 'Enviei a logo'),
    });
    const lista = await criarClienteGmail({ accessToken: 'tok', fetch }).conversas('ana@cliente.com');
    expect(lista).toEqual([
      { id: 't2', assunto: 'Re: Logo', trecho: 'Enviei a logo', data: '2026-03-11T12:00:00.000Z', de: 'Você', link: 'https://mail.google.com/mail/u/0/#all/t2' },
      { id: 't1', assunto: 'Proposta', trecho: 'Segue a proposta', data: '2026-03-10T12:00:00.000Z', de: 'Ana', link: 'https://mail.google.com/mail/u/0/#all/t1' },
    ]);
    const busca = requisicoes.find((r) => r.url.pathname.endsWith('/threads'));
    expect(busca.url.searchParams.get('q')).toBe('from:"ana@cliente.com" OR to:"ana@cliente.com"');
    expect(busca.url.searchParams.get('maxResults')).toBe('10');
    const detalhe = requisicoes.find((r) => r.url.pathname.endsWith('/threads/t1'));
    expect(detalhe.url.searchParams.get('format')).toBe('metadata');
    expect(detalhe.url.searchParams.getAll('metadataHeaders')).toEqual(['Subject', 'From', 'Date']);
  });

  it('e-mail com aspas e barra é saneado e não injeta operadores', async () => {
    const { fetch, requisicoes } = falso({
      [`GET ${BASE}/profile`]: { emailAddress: 'eu@gmail.com' },
      [`GET ${BASE}/threads`]: {},
    });
    expect(await criarClienteGmail({ accessToken: 'tok', fetch }).conversas('a"b\\c+x@d.com" OR in:trash')).toEqual([]);
    const q = requisicoes.find((r) => r.url.pathname.endsWith('/threads')).url.searchParams.get('q');
    expect(q).toBe('from:"abc+x@d.com OR in:trash" OR to:"abc+x@d.com OR in:trash"');
    expect(q.match(/"/g)).toHaveLength(4);
  });

  it('401 marca como desconectado e rede dá mensagem de internet', async () => {
    const { fetch } = falso({ [`GET ${BASE}/profile`]: { status: 401, corpo: {} } });
    await expect(criarClienteGmail({ accessToken: 'x', fetch }).usuario()).rejects.toMatchObject({ desconectado: true });
    const semRede = async () => { throw new Error('x'); };
    await expect(criarClienteGmail({ accessToken: 'x', fetch: semRede }).usuario()).rejects.toThrow('Não foi possível falar com o Google. Verifique a internet.');
    expect(new ErroGmail('m')).toMatchObject({ status: 0, desconectado: false });
  });
});
