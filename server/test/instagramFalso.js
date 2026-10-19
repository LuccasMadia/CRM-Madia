// fetch falso para a Graph API: rotas por "caminho" (sem query) → corpo JSON,
// { status, corpo, tipo? } ou função (url) => ...; registra as URLs chamadas.
export function fetchFalso(rotas) {
  const chamadas = [];
  // requisicoes: { url, metodo, corpo } — corpo é o form-urlencoded já convertido em objeto.
  const requisicoes = [];
  const fetch = async (entrada, init = {}) => {
    const url = new URL(String(entrada));
    const metodo = (init.method ?? 'GET').toUpperCase();
    const corpoEnviado = init.body === undefined ? null : Object.fromEntries(new URLSearchParams(String(init.body)));
    chamadas.push(url);
    requisicoes.push({ url, metodo, corpo: corpoEnviado, headers: init.headers ?? {} });
    const caminho = url.hostname === 'graph.instagram.com' ? url.pathname : url.href;
    const chave = `${metodo} ${caminho}` in rotas ? `${metodo} ${caminho}` : caminho;
    let r = rotas[chave];
    if (typeof r === 'function') r = await r(url);
    if (r === undefined) r = { status: 404, corpo: { error: { message: `sem rota ${chave}` } } };
    const { status, corpo, tipo = 'image/jpeg' } = r && 'status' in r && 'corpo' in r ? r : { status: 200, corpo: r };
    if (corpo instanceof Uint8Array) return new Response(corpo, { status, headers: { 'Content-Type': tipo } });
    return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return { fetch, chamadas, requisicoes };
}
