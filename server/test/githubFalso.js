// fetch falso para a API do GitHub: rotas "METODO url" (ou só a url, para GET) → corpo JSON,
// { status, corpo, headers? } ou função ({ url, corpo }) => ...; registra as requisições (corpo já como objeto).
export function githubFalso(rotas = {}) {
  const requisicoes = [];
  const fetch = async (entrada, init = {}) => {
    const url = new URL(String(entrada));
    const metodo = (init.method ?? 'GET').toUpperCase();
    const corpo = init.body === undefined ? null : JSON.parse(String(init.body));
    requisicoes.push({ url, metodo, corpo, headers: init.headers ?? {} });
    const chave = `${metodo} ${url.href}` in rotas ? `${metodo} ${url.href}` : url.href;
    let r = rotas[chave];
    if (typeof r === 'function') r = await r({ url, corpo, metodo });
    if (r === undefined) r = { status: 404, corpo: { message: `sem rota ${chave}` } };
    const { status, corpo: resposta, headers = {} } = r && 'status' in r ? r : { status: 200, corpo: r };
    return new Response(status === 204 ? null : JSON.stringify(resposta ?? {}), { status, headers: { 'Content-Type': 'application/json', ...headers } });
  };
  return { fetch, requisicoes };
}
