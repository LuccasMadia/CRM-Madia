import { vi } from 'vitest';

const RESPOSTA = Symbol('resposta');
export const resposta = (status, corpo) => ({ [RESPOSTA]: true, status, corpo });

// rotas: { 'GET /clientes': dados | resposta(status, corpo) | (corpo) => ... }
export function mockApi(rotas) {
  const chamadas = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, opcoes = {}) => {
      const metodo = opcoes.method ?? 'GET';
      const caminho = url.replace(/^\/api/, '');
      const corpo = typeof opcoes.body === 'string' ? JSON.parse(opcoes.body) : opcoes.body;
      chamadas.push({ metodo, caminho, corpo });
      const chave = `${metodo} ${caminho}`;
      let r = rotas[chave];
      if (typeof r === 'function') r = r(corpo);
      if (r === undefined) r = resposta(404, { erro: `Sem mock para ${chave}` });
      const { status, corpo: dados } = r?.[RESPOSTA] ? r : { status: 200, corpo: r };
      if (status === 204) return new Response(null, { status });
      return new Response(JSON.stringify(dados), { status, headers: { 'Content-Type': 'application/json' } });
    }),
  );
  return { chamadas, rotas };
}
