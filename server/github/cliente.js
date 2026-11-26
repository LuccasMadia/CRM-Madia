// API REST do GitHub. Sempre cria repositório privado; nunca altera visibilidade.
const BASE = 'https://api.github.com';

export class ErroGithub extends Error {
  constructor(mensagem, { status = 0, tokenInvalido = false } = {}) {
    super(mensagem);
    this.status = status;
    this.tokenInvalido = tokenInvalido;
  }
}

function mensagemDoStatus(status) {
  if (status === 401 || status === 403) return 'Token do GitHub inválido ou sem permissão. Cole um novo em Configurações → GitHub.';
  if (status === 404) return 'Repositório não encontrado no GitHub.';
  if (status === 422) return 'O GitHub recusou o nome do repositório (talvez já exista).';
  return `O GitHub respondeu ${status}.`;
}

const dataDaSemana = (epoch) => new Date(epoch * 1000).toISOString().slice(0, 10);

const mapear = (r) => ({
  nome_completo: r.full_name, privado: Boolean(r.private), arquivado: Boolean(r.archived), fork: Boolean(r.fork),
  ultimo_commit_em: r.pushed_at ?? null, url: r.html_url,
});

export function criarClienteGithub({ token, fetch = globalThis.fetch, timeoutMs = 15_000 }) {
  async function chamar(urlOuCaminho, { metodo = 'GET', corpo } = {}) {
    const url = urlOuCaminho.startsWith('http') ? urlOuCaminho : `${BASE}${urlOuCaminho}`;
    let resposta;
    try {
      resposta = await fetch(url, {
        method: metodo,
        headers: {
          Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
          ...(corpo ? { 'Content-Type': 'application/json' } : {}),
        },
        body: corpo ? JSON.stringify(corpo) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new ErroGithub('Não foi possível falar com o GitHub. Verifique a internet.');
    }
    if (!resposta.ok) {
      throw new ErroGithub(mensagemDoStatus(resposta.status), {
        status: resposta.status, tokenInvalido: resposta.status === 401 || resposta.status === 403,
      });
    }
    return resposta;
  }
  const json = async (resposta) => resposta.json().catch(() => ({}));

  async function usuario() {
    return (await json(await chamar('/user'))).login;
  }

  async function listarRepositorios() {
    const lista = [];
    let proxima = '/user/repos?per_page=100&affiliation=owner';
    while (proxima) {
      const resposta = await chamar(proxima);
      lista.push(...(await json(resposta)).map(mapear));
      proxima = /<([^>]+)>;\s*rel="next"/.exec(resposta.headers.get('link') ?? '')?.[1] ?? null;
    }
    return lista;
  }

  async function criarRepositorio(nome) {
    return mapear(await json(await chamar('/user/repos', { metodo: 'POST', corpo: { name: nome, private: true, auto_init: false } })));
  }

  async function commitsPorSemana(nomeCompleto) {
    const resposta = await chamar(`/repos/${nomeCompleto}/stats/commit_activity`);
    if (resposta.status === 202) return { semanas: [], calculando: true };
    const corpo = await json(resposta);
    const semanas = Array.isArray(corpo) ? corpo.map((s) => ({ semana: dataDaSemana(s.week), total: s.total })) : [];
    return { semanas, calculando: false };
  }

  return { usuario, listarRepositorios, criarRepositorio, commitsPorSemana };
}
