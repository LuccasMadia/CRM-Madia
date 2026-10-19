// API REST da Vercel. Sem teamId: o escopo padrão do token é o time do dono.
const BASE = 'https://api.vercel.com';

export class ErroVercel extends Error {
  constructor(mensagem, { status = 0, tokenInvalido = false } = {}) {
    super(mensagem);
    this.status = status;
    this.tokenInvalido = tokenInvalido;
  }
}

function mensagemDoStatus(status) {
  if (status === 401 || status === 403) return 'Token da Vercel inválido ou sem permissão. Cole um novo em Configurações → Vercel.';
  if (status === 404) return 'Projeto não encontrado na Vercel.';
  return `A Vercel respondeu ${status}.`;
}

export function criarClienteVercel({ token, fetch = globalThis.fetch }) {
  async function requisitar(caminho, metodo = 'GET') {
    let resposta;
    try {
      resposta = await fetch(`${BASE}${caminho}`, { method: metodo, headers: { Authorization: `Bearer ${token}` } });
    } catch {
      throw new ErroVercel('Não foi possível falar com a Vercel. Verifique a internet.');
    }
    if (!resposta.ok) {
      throw new ErroVercel(mensagemDoStatus(resposta.status), {
        status: resposta.status,
        tokenInvalido: resposta.status === 401 || resposta.status === 403,
      });
    }
    return resposta.json().catch(() => ({}));
  }

  async function listarProjetos() {
    const { projects = [] } = await requisitar('/v10/projects?limit=100');
    return projects.map((p) => ({ id: p.id, nome: p.name })).sort((a, b) => a.nome.localeCompare(b.nome));
  }

  const id = encodeURIComponent;

  async function pausar(projetoId) {
    await requisitar(`/v1/projects/${id(projetoId)}/pause`, 'POST');
  }

  async function religar(projetoId) {
    await requisitar(`/v1/projects/${id(projetoId)}/unpause`, 'POST');
  }

  async function estaPausado(projetoId) {
    const corpo = await requisitar(`/v9/projects/${id(projetoId)}`);
    return corpo.paused === true;
  }

  return { listarProjetos, pausar, religar, estaPausado };
}
