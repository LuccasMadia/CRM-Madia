// Abre o endereço do site: qualquer resposta abaixo de 500 conta como "no ar" (um 404 ainda é o site respondendo).
export async function checarSite({ url, fetch, timeoutMs = 10_000 }) {
  try {
    const resposta = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
    if (resposta.status >= 500) return { ok: false, motivo: `Erro ${resposta.status}` };
    return { ok: true, motivo: null };
  } catch (erro) {
    if (erro?.name === 'TimeoutError' || erro?.name === 'AbortError') {
      return { ok: false, motivo: `Sem resposta em ${Math.round(timeoutMs / 1000)} s` };
    }
    return { ok: false, motivo: `Não conectou (${erro?.message ?? erro})` };
  }
}
