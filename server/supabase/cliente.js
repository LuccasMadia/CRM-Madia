// API de gerenciamento do Supabase (somente leitura: só lista projetos).
const BASE = 'https://api.supabase.com/v1';

export class ErroSupabase extends Error {
  constructor(mensagem, { status = 0, tokenInvalido = false } = {}) {
    super(mensagem);
    this.status = status;
    this.tokenInvalido = tokenInvalido;
  }
}

function mensagemDoStatus(status) {
  if (status === 401 || status === 403) return 'Token do Supabase inválido ou sem permissão. Cole um novo em Configurações → Supabase.';
  return `O Supabase respondeu ${status}.`;
}

export function normalizarEstado(status) {
  if (status === 'ACTIVE_HEALTHY') return 'no_ar';
  if (status === 'INACTIVE' || status === 'PAUSING') return 'pausado';
  if (status === 'COMING_UP' || status === 'RESTORING') return 'subindo';
  return 'outro';
}

export function criarClienteSupabase({ token, fetch = globalThis.fetch, timeoutMs = 15_000 }) {
  async function listarProjetos() {
    let resposta;
    try {
      resposta = await fetch(`${BASE}/projects`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new ErroSupabase('Não foi possível falar com o Supabase. Verifique a internet.');
    }
    if (!resposta.ok) {
      throw new ErroSupabase(mensagemDoStatus(resposta.status), { status: resposta.status, tokenInvalido: resposta.status === 401 || resposta.status === 403 });
    }
    const lista = await resposta.json().catch(() => []);
    return (Array.isArray(lista) ? lista : []).map((p) => ({
      ref: p.id, nome: p.name, regiao: p.region, estado: normalizarEstado(p.status), link: `https://supabase.com/dashboard/project/${p.id}`,
    }));
  }

  return { listarProjetos };
}
