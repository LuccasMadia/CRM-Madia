import { describe, it, expect } from 'vitest';
import { fetchFalso } from '../test/instagramFalso.js';
import { criarClienteVercel, ErroVercel } from './vercel.js';

const BASE = 'https://api.vercel.com';

describe('cliente da Vercel', () => {
  it('lista projetos ordenados por nome e envia o token', async () => {
    const { fetch, requisicoes } = fetchFalso({
      [`${BASE}/v10/projects?limit=100`]: {
        projects: [{ id: 'prj_b', name: 'barbearia' }, { id: 'prj_a', name: 'alfa' }],
      },
    });
    const lista = await criarClienteVercel({ token: 'tok', fetch }).listarProjetos();
    expect(lista).toEqual([{ id: 'prj_a', nome: 'alfa' }, { id: 'prj_b', nome: 'barbearia' }]);
    expect(requisicoes[0].headers.Authorization).toBe('Bearer tok');
  });

  it('pausa e religa com POST', async () => {
    const { fetch, requisicoes } = fetchFalso({
      [`POST ${BASE}/v1/projects/prj_1/pause`]: {},
      [`POST ${BASE}/v1/projects/prj_1/unpause`]: {},
    });
    const cliente = criarClienteVercel({ token: 'tok', fetch });
    await cliente.pausar('prj_1');
    await cliente.religar('prj_1');
    expect(requisicoes.map((r) => `${r.metodo} ${r.url.href}`)).toEqual([
      `POST ${BASE}/v1/projects/prj_1/pause`,
      `POST ${BASE}/v1/projects/prj_1/unpause`,
    ]);
  });

  it('estaPausado lê o campo paused', async () => {
    const { fetch } = fetchFalso({
      [`${BASE}/v9/projects/prj_1`]: { paused: true },
      [`${BASE}/v9/projects/prj_2`]: {},
    });
    const cliente = criarClienteVercel({ token: 'tok', fetch });
    expect(await cliente.estaPausado('prj_1')).toBe(true);
    expect(await cliente.estaPausado('prj_2')).toBe(false);
  });

  it('401 vira token inválido', async () => {
    const { fetch } = fetchFalso({ [`${BASE}/v10/projects?limit=100`]: { status: 401, corpo: {} } });
    const erro = await criarClienteVercel({ token: 'x', fetch }).listarProjetos().catch((e) => e);
    expect(erro).toBeInstanceOf(ErroVercel);
    expect(erro.tokenInvalido).toBe(true);
    expect(erro.status).toBe(401);
    expect(erro.message).toBe('Token da Vercel inválido ou sem permissão. Cole um novo em Configurações → Vercel.');
  });

  it('404 vira projeto não encontrado e outro status vira mensagem genérica', async () => {
    const { fetch } = fetchFalso({
      [`${BASE}/v9/projects/prj_x`]: { status: 404, corpo: {} },
      [`POST ${BASE}/v1/projects/prj_y/pause`]: { status: 500, corpo: {} },
    });
    const cliente = criarClienteVercel({ token: 'tok', fetch });
    const e404 = await cliente.estaPausado('prj_x').catch((e) => e);
    expect(e404.message).toBe('Projeto não encontrado na Vercel.');
    expect(e404.tokenInvalido).toBe(false);
    const e500 = await cliente.pausar('prj_y').catch((e) => e);
    expect(e500.message).toBe('A Vercel respondeu 500.');
  });

  it('aceita a lista como array puro e projeto sem nome', async () => {
    const { fetch } = fetchFalso({
      [`${BASE}/v10/projects?limit=100`]: [{ id: 'prj_b', name: 'b' }, { id: 'prj_x' }],
    });
    const lista = await criarClienteVercel({ token: 'tok', fetch }).listarProjetos();
    expect(lista.map((p) => p.id)).toEqual(['prj_x', 'prj_b']);
  });

  it('403 também é token inválido', async () => {
    const { fetch } = fetchFalso({ [`${BASE}/v10/projects?limit=100`]: { status: 403, corpo: {} } });
    const erro = await criarClienteVercel({ token: 'x', fetch }).listarProjetos().catch((e) => e);
    expect(erro.tokenInvalido).toBe(true);
  });

  it('corpo de sucesso que não é JSON não quebra pausar', async () => {
    const fetch = async () => new Response('ok', { status: 200 });
    await expect(criarClienteVercel({ token: 'tok', fetch }).pausar('prj_1')).resolves.toBeUndefined();
  });

  it('manda um sinal de tempo limite e trata o estouro como sem rede', async () => {
    let sinal;
    const fetch = async (url, init) => {
      sinal = init.signal;
      throw new DOMException('timeout', 'TimeoutError');
    };
    const erro = await criarClienteVercel({ token: 'tok', fetch, timeoutMs: 50 }).estaPausado('prj_1').catch((e) => e);
    expect(sinal).toBeInstanceOf(AbortSignal);
    expect(erro.status).toBe(0);
    expect(erro.message).toBe('Não foi possível falar com a Vercel. Verifique a internet.');
  });

  it('sem rede vira status 0', async () => {
    const fetch = async () => { throw new TypeError('fetch failed'); };
    const erro = await criarClienteVercel({ token: 'tok', fetch }).listarProjetos().catch((e) => e);
    expect(erro.status).toBe(0);
    expect(erro.message).toBe('Não foi possível falar com a Vercel. Verifique a internet.');
  });
});
