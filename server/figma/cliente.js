// API REST do Figma (somente leitura).
const BASE = 'https://api.figma.com/v1';

export class ErroFigma extends Error {
  constructor(mensagem, { status = 0, tokenInvalido = false } = {}) {
    super(mensagem);
    this.status = status;
    this.tokenInvalido = tokenInvalido;
  }
}

function mensagemDoStatus(status) {
  if (status === 401 || status === 403) return 'Token do Figma inválido ou sem permissão. Cole um novo em Configurações → Figma.';
  if (status === 404) return 'Arquivo do Figma não encontrado.';
  return `O Figma respondeu ${status}.`;
}

export function criarClienteFigma({ token, fetch = globalThis.fetch, timeoutMs = 15_000 }) {
  async function ler(caminho) {
    let resposta;
    try {
      resposta = await fetch(`${BASE}${caminho}`, { headers: { 'X-Figma-Token': token, Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      throw new ErroFigma('Não foi possível falar com o Figma. Verifique a internet.');
    }
    if (!resposta.ok) {
      throw new ErroFigma(mensagemDoStatus(resposta.status), { status: resposta.status, tokenInvalido: resposta.status === 401 || resposta.status === 403 });
    }
    return resposta.json().catch(() => ({}));
  }

  return {
    usuario: async () => (await ler('/me')).handle,
    arquivo: async (codigo) => {
      const dados = await ler(`/files/${encodeURIComponent(codigo)}?depth=1`);
      return { nome: dados.name, editado_em: dados.lastModified, url: `https://www.figma.com/design/${codigo}` };
    },
  };
}
