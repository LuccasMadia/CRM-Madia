// Abre o endereço do site: qualquer resposta abaixo de 500 conta como "no ar" (um 404 ainda é o site respondendo).
// `rede: true` marca falha de conexão/tempo (e não uma resposta 5xx do site), para o monitor distinguir
// "o site caiu" de "o meu computador ficou sem internet".
export async function checarSite({ url, fetch, timeoutMs = 10_000 }) {
  try {
    const resposta = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
    // Libera o socket sem baixar a página inteira.
    await resposta.body?.cancel().catch(() => {});
    if (resposta.status >= 500) return { ok: false, motivo: `Erro ${resposta.status}` };
    return { ok: true, motivo: null };
  } catch (erro) {
    if (erro?.name === 'TimeoutError' || erro?.name === 'AbortError') {
      return { ok: false, motivo: `Sem resposta em ${Math.round(timeoutMs / 1000)} s`, rede: true };
    }
    return { ok: false, motivo: `Não conectou (${erro?.cause?.code ?? erro?.message ?? erro})`, rede: true };
  }
}
