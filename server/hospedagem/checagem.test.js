import { describe, it, expect } from 'vitest';
import { checarSite } from './checagem.js';

const url = 'https://site.test/';
const com = (status) => async () => new Response('x', { status });

describe('checarSite', () => {
  it('200 e 404 contam como no ar', async () => {
    expect(await checarSite({ url, fetch: com(200) })).toEqual({ ok: true, motivo: null });
    expect(await checarSite({ url, fetch: com(404) })).toEqual({ ok: true, motivo: null });
  });

  it('5xx e falha', async () => {
    expect(await checarSite({ url, fetch: com(503) })).toEqual({ ok: false, motivo: 'Erro 503' });
  });

  it('timeout e abort viram "Sem resposta"', async () => {
    for (const nome of ['TimeoutError', 'AbortError']) {
      const fetch = async () => {
        throw new DOMException('x', nome);
      };
      expect(await checarSite({ url, fetch })).toEqual({ ok: false, motivo: 'Sem resposta em 10 s' });
    }
    const fetch = async () => {
      throw new DOMException('x', 'TimeoutError');
    };
    expect((await checarSite({ url, fetch, timeoutMs: 3000 })).motivo).toBe('Sem resposta em 3 s');
  });

  it('erro de rede comum', async () => {
    const fetch = async () => {
      throw new TypeError('fetch failed');
    };
    expect(await checarSite({ url, fetch })).toEqual({ ok: false, motivo: 'Não conectou (fetch failed)' });
  });

  it('segue redirecionamentos e usa timeout', async () => {
    let init;
    await checarSite({
      url,
      fetch: async (u, i) => {
        init = i;
        return new Response('', { status: 200 });
      },
    });
    expect(init.redirect).toBe('follow');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
