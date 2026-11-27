// OAuth do Google e API do Gmail (somente leitura).
const AUTORIZAR = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const REVOGAR = 'https://oauth2.googleapis.com/revoke';
const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const ESCOPO = 'https://www.googleapis.com/auth/gmail.readonly';
const SEM_REDE = 'Não foi possível falar com o Google. Verifique a internet.';

export class ErroGmail extends Error {
  constructor(mensagem, { status = 0, desconectado = false } = {}) {
    super(mensagem);
    this.status = status;
    this.desconectado = desconectado;
  }
}

async function chamar(fetch, timeoutMs, url, init = {}) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new ErroGmail(SEM_REDE);
  }
}

const formulario = (campos) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(campos).toString(),
});

export function criarClienteGoogle({ fetch = globalThis.fetch, timeoutMs = 15_000 } = {}) {
  async function pedirToken(campos) {
    const resposta = await chamar(fetch, timeoutMs, TOKEN, formulario(campos));
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      const revogado = dados.error === 'invalid_grant';
      throw new ErroGmail(
        revogado ? 'Gmail desconectado. Conecte de novo em Configurações → Gmail.' : `O Google recusou a conexão (${dados.error ?? resposta.status}). Confira o Client ID e o Client Secret.`,
        { status: resposta.status, desconectado: revogado },
      );
    }
    return dados;
  }

  return {
    urlDeAutorizacao({ clientId, redirectUri, state }) {
      const parametros = new URLSearchParams({
        client_id: clientId, redirect_uri: redirectUri, response_type: 'code', access_type: 'offline', prompt: 'consent', scope: ESCOPO, state,
      });
      return `${AUTORIZAR}?${parametros}`;
    },
    async trocarCodigo({ clientId, clientSecret, redirectUri, codigo }) {
      const dados = await pedirToken({ grant_type: 'authorization_code', code: codigo, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri });
      return { refresh_token: dados.refresh_token, access_token: dados.access_token };
    },
    async renovar({ clientId, clientSecret, refreshToken }) {
      const dados = await pedirToken({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret });
      return dados.access_token;
    },
    async revogar(token) {
      await chamar(fetch, timeoutMs, REVOGAR, formulario({ token }));
    },
  };
}

const nomeDe = (de, usuario) => {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(de);
  const endereco = (m ? m[2] : de).trim().toLowerCase();
  if (endereco === usuario.toLowerCase()) return 'Você';
  return (m && m[1].trim()) || endereco;
};

export function criarClienteGmail({ accessToken, fetch = globalThis.fetch, timeoutMs = 15_000 }) {
  async function ler(caminho) {
    const resposta = await chamar(fetch, timeoutMs, `${GMAIL}${caminho}`, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } });
    if (!resposta.ok) {
      const desconectado = resposta.status === 401;
      throw new ErroGmail(
        desconectado ? 'Gmail desconectado. Conecte de novo em Configurações → Gmail.' : `O Gmail respondeu ${resposta.status}.`,
        { status: resposta.status, desconectado },
      );
    }
    return resposta.json().catch(() => ({}));
  }

  const usuario = async () => (await ler('/profile')).emailAddress;

  return {
    usuario,
    async conversas(email) {
      const limpo = String(email).replace(/["\\]/g, '');
      const eu = await usuario();
      const busca = new URLSearchParams({ q: `from:"${limpo}" OR to:"${limpo}"`, maxResults: '10' });
      const { threads = [] } = await ler(`/threads?${busca}`);
      const detalhes = await Promise.all(threads.map(async ({ id }) => {
        const campos = new URLSearchParams([['format', 'metadata'], ['metadataHeaders', 'Subject'], ['metadataHeaders', 'From'], ['metadataHeaders', 'Date']]);
        const conversa = await ler(`/threads/${encodeURIComponent(id)}?${campos}`);
        const ultima = conversa.messages?.at(-1);
        const cabecalho = (nome) => ultima?.payload?.headers?.find((h) => h.name.toLowerCase() === nome.toLowerCase())?.value ?? '';
        const quando = new Date(cabecalho('Date'));
        return {
          id, assunto: cabecalho('Subject') || '(sem assunto)', trecho: conversa.snippet ?? '',
          data: Number.isNaN(quando.getTime()) ? null : quando.toISOString(),
          de: nomeDe(cabecalho('From'), eu), link: `https://mail.google.com/mail/u/0/#all/${id}`,
        };
      }));
      return detalhes.sort((a, b) => String(b.data).localeCompare(String(a.data)));
    },
  };
}
