// fetch falso para o Google/Gmail: rotas "METODO origem+caminho" → corpo JSON, { status, corpo } ou função ({ url, corpo }) => ...;
// trata o corpo como formulário (o Google recebe application/x-www-form-urlencoded, não JSON) e registra as requisições.
export function googleFalso(rotas = {}) {
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
