export class ErroApi extends Error {
  constructor(status, corpo) {
    super(corpo?.erro ?? (corpo?.erros ? 'Verifique os campos destacados' : `Erro ${status}`));
    this.status = status;
    this.erros = corpo?.erros ?? [];
  }
}

const MARCA_RECARGA = 'crm-recarregou-sessao';

function lerMarca() {
  try {
    return sessionStorage.getItem(MARCA_RECARGA) === '1';
  } catch {
    return false;
  }
}

function gravarMarca(ligada) {
  try {
    if (ligada) sessionStorage.setItem(MARCA_RECARGA, '1');
    else sessionStorage.removeItem(MARCA_RECARGA);
  } catch {
    // Sem sessionStorage (modo privado, bloqueio): segue sem a trava.
  }
}

export async function api(caminho, { method = 'GET', body } = {}) {
  const opcoes = { method, headers: { 'X-CRM': '1' }, redirect: 'manual' };
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
  // Com redirect manual, o Cloudflare Access (sessão expirada) devolve um redirect opaco para a tela de login.
  // Recarrega sozinho só uma vez por expiração: se a recarga não levou ao login, não entra em loop.
  if (resposta.type === 'opaqueredirect') {
    if (lerMarca()) throw new ErroApi(401, { erro: 'Sua sessão expirou. Recarregue a página para entrar de novo.' });
    gravarMarca(true);
    window.location.reload();
    throw new ErroApi(401, { erro: 'Sua sessão expirou. Recarregando para entrar de novo…' });
  }
  if (resposta.ok) gravarMarca(false);
  if (resposta.status === 204) return null;
  const tipo = resposta.headers.get('content-type') ?? '';
  const corpo = tipo.includes('application/json') ? await resposta.json() : null;
  if (!resposta.ok) throw new ErroApi(resposta.status, corpo);
  return corpo;
}
