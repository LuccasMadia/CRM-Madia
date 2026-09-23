export class ErroApi extends Error {
  constructor(status, corpo) {
    super(corpo?.erro ?? (corpo?.erros ? 'Verifique os campos destacados' : `Erro ${status}`));
    this.status = status;
    this.erros = corpo?.erros ?? [];
  }
}

export async function api(caminho, { method = 'GET', body } = {}) {
  const opcoes = { method, headers: { 'X-CRM': '1' } };
  if (body instanceof FormData) {
    opcoes.body = body;
  } else if (body !== undefined) {
    opcoes.body = JSON.stringify(body);
    opcoes.headers['Content-Type'] = 'application/json';
  }
  let resposta;
  try {
    resposta = await fetch(`/api${caminho}`, opcoes);
  } catch {
    throw new ErroApi(0, { erro: 'Não foi possível falar com o servidor do CRM. Ele está rodando (npm start)?' });
  }
  if (resposta.status === 204) return null;
  const tipo = resposta.headers.get('content-type') ?? '';
  const corpo = tipo.includes('application/json') ? await resposta.json() : null;
  if (!resposta.ok) throw new ErroApi(resposta.status, corpo);
  return corpo;
}
