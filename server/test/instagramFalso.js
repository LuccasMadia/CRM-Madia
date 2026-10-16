// fetch falso para a Graph API: rotas por "caminho" (sem query) → corpo JSON,
// { status, corpo } ou função (url) => ...; registra as URLs chamadas.
export function fetchFalso(rotas) {
  const chamadas = [];
  const fetch = async (entrada) => {
    const url = new URL(String(entrada));
    chamadas.push(url);
    const chave = url.hostname === 'graph.instagram.com' ? url.pathname : url.href;
    let r = rotas[chave];
    if (typeof r === 'function') r = r(url);
    if (r === undefined) r = { status: 404, corpo: { error: { message: `sem rota ${chave}` } } };
    const { status, corpo } = r && 'status' in r && 'corpo' in r ? r : { status: 200, corpo: r };
    if (corpo instanceof Uint8Array) return new Response(corpo, { status });
    return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return { fetch, chamadas };
}
