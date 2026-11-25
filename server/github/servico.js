import { obterConfig } from '../repos/config.js';
import { repoProjetos } from '../repos/projetos.js';
import { criarClienteGithub, ErroGithub } from './cliente.js';
import { montarAuditoria, nomeDoRepositorio } from './auditoria.js';
import { criarCache } from './cache.js';

const DEZ_MINUTOS = 10 * 60 * 1000;

// Tudo que o CRM faz no GitHub passa por aqui (rotas, criação automática). Nunca altera visibilidade.
export function criarServicoGithub({ db, fetch }) {
  const projetos = repoProjetos(db);
  const cache = criarCache(DEZ_MINUTOS);
  const emCriacao = new Set();

  const token = () => obterConfig(db, 'github_token');
  const cliente = () => (token() ? criarClienteGithub({ token: token(), fetch }) : null);
  const estado = () => ({ conectado: Boolean(token()), usuario: obterConfig(db, 'github_usuario') ?? null });
  const repositorios = ({ forcar = false } = {}) => cache.obter('repositorios', () => cliente().listarRepositorios(), { forcar });

  async function auditoria({ forcar = false } = {}) {
    const lista = await repositorios({ forcar });
    return montarAuditoria({ repositorios: lista, projetos: projetos.listar() });
  }

  // Formato que a página do projeto usa. Repositório apagado no GitHub vira encontrado:false, não erro.
  async function detalheProjeto(projeto, { forcar = false } = {}) {
    const vazio = { repo: projeto.github_repo ?? null, visibilidade: null, encontrado: false, commits: null };
    if (!projeto.github_repo) return vazio;
    const lista = await repositorios({ forcar });
    const achado = lista.find((r) => r.nome_completo.toLowerCase() === projeto.github_repo.toLowerCase());
    if (!achado) return vazio;
    try {
      const commits = await cache.obter(`commits:${projeto.github_repo}`, () => cliente().commitsPorSemana(projeto.github_repo), { forcar });
      return { repo: projeto.github_repo, visibilidade: achado.privado ? 'privado' : 'publico', encontrado: true, commits };
    } catch (erro) {
      if (erro instanceof ErroGithub && erro.status === 404) return vazio;
      throw erro;
    }
  }

  // Cria o repositório privado do projeto e o liga. Nunca lança por falha do GitHub: devolve { criado, erro? }.
  async function garantirRepositorio(projetoId) {
    const projeto = projetos.obter(projetoId);
    if (!projeto || projeto.github_repo) return { criado: false };
    if (!token()) return { criado: false, erro: 'Conecte o GitHub em Configurações.' };
    if (emCriacao.has(projetoId)) return { criado: false };
    emCriacao.add(projetoId);
    try {
      const existentes = await repositorios({ forcar: true });
      const usados = new Set(existentes.map((r) => r.nome_completo.split('/')[1].toLowerCase()));
      const repo = await cliente().criarRepositorio(nomeDoRepositorio(projeto.titulo, usados));
      projetos.atualizar(projetoId, { github_repo: repo.nome_completo });
      cache.limpar();
      return { criado: true, repo };
    } catch (erro) {
      if (erro instanceof ErroGithub) return { criado: false, erro: erro.message };
      throw erro;
    } finally {
      emCriacao.delete(projetoId);
    }
  }

  return { estado, cliente, auditoria, detalheProjeto, garantirRepositorio, limparCache: () => cache.limpar() };
}
