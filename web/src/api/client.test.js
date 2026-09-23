import { describe, it, expect, vi } from 'vitest';
import { api } from './client.js';

describe('api', () => {
  it('envia o cabeçalho X-CRM exigido pelo servidor, inclusive em uploads', async () => {
    const fetchFalso = vi.fn(async () => new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchFalso);
    await api('/clientes', { method: 'POST', body: { nome: 'Ana' } });
    await api('/projetos/1/portfolio/imagens', { method: 'POST', body: new FormData() });
    for (const [, opcoes] of fetchFalso.mock.calls) expect(opcoes.headers['X-CRM']).toBe('1');
  });
});
