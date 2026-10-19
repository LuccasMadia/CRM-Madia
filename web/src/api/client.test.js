import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { api, ErroApi } from './client.js';

describe('api', () => {
  it('envia o cabeçalho X-CRM exigido pelo servidor, inclusive em uploads', async () => {
    const fetchFalso = vi.fn(async () => new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchFalso);
    await api('/clientes', { method: 'POST', body: { nome: 'Ana' } });
    await api('/projetos/1/portfolio/imagens', { method: 'POST', body: new FormData() });
    for (const [, opcoes] of fetchFalso.mock.calls) expect(opcoes.headers['X-CRM']).toBe('1');
  });

  describe('sessão do Cloudflare Access expirada', () => {
    const locationOriginal = window.location;

    afterEach(() => {
      Object.defineProperty(window, 'location', { value: locationOriginal, configurable: true });
      vi.unstubAllGlobals();
    });

    it('pede redirect manual para detectar o redirecionamento do login', async () => {
      const fetchFalso = vi.fn(async () => new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      vi.stubGlobal('fetch', fetchFalso);
      await api('/clientes');
      expect(fetchFalso.mock.calls[0][1].redirect).toBe('manual');
    });

    const opaco = () => ({ type: 'opaqueredirect', status: 0, ok: false, headers: new Headers() });
    const ok = () => new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const trocarReload = () => {
      const reload = vi.fn();
      Object.defineProperty(window, 'location', { value: { ...window.location, reload }, configurable: true });
      return reload;
    };

    beforeEach(() => sessionStorage.clear());

    it('recarrega a página uma vez e lança erro 401 quando a resposta é opaqueredirect', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => opaco()));
      const reload = trocarReload();

      const erro = await api('/clientes').catch((e) => e);

      expect(erro).toBeInstanceOf(ErroApi);
      expect(erro.status).toBe(401);
      expect(erro.message).toBe('Sua sessão expirou. Recarregando para entrar de novo…');
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it('não recarrega de novo numa segunda expiração seguida, para não entrar em loop', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => opaco()));
      const reload = trocarReload();

      await api('/clientes').catch(() => {});
      const erro = await api('/clientes').catch((e) => e);

      expect(reload).toHaveBeenCalledTimes(1);
      expect(erro).toBeInstanceOf(ErroApi);
      expect(erro.status).toBe(401);
      expect(erro.message).toBe('Sua sessão expirou. Recarregue a página para entrar de novo.');
    });

    it('uma resposta bem-sucedida libera um novo recarregamento automático', async () => {
      const fetchFalso = vi.fn(async () => opaco());
      vi.stubGlobal('fetch', fetchFalso);
      const reload = trocarReload();

      await api('/clientes').catch(() => {});
      fetchFalso.mockImplementationOnce(async () => ok());
      await api('/clientes');
      await api('/clientes').catch(() => {});

      expect(reload).toHaveBeenCalledTimes(2);
    });
  });
});
