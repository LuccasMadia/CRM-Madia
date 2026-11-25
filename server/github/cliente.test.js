import { describe, it, expect } from 'vitest';
import { githubFalso } from '../test/githubFalso.js';
import { criarClienteGithub, ErroGithub } from './cliente.js';

const BASE = 'https://api.github.com';
const bruto = (nome, extra = {}) => ({
  full_name: `lucas/${nome}`, private: true, archived: false, fork: false, pushed_at: '2026-11-20T10:00:00Z', html_url: `https://github.com/lucas/${nome}`, ...extra,
});

describe('cliente do GitHub', () => {
  it('lista repositórios seguindo a paginação e mapeia o formato', async () => {
    const { fetch, requisicoes } = githubFalso({
      [`${BASE}/user/repos?per_page=100&affiliation=owner`]: {
        status: 200, corpo: [bruto('a')], headers: { Link: `<${BASE}/user/repos?per_page=100&affiliation=owner&page=2>; rel="next"` },
      },
      [`${BASE}/user/repos?per_page=100&affiliation=owner&page=2`]: [bruto('b', { private: false, archived: true, pushed_at: null })],
    });
    const lista = await criarClienteGithub({ token: 'tok', fetch }).listarRepositorios();
    expect(lista).toEqual([
      { nome_completo: 'lucas/a', privado: true, arquivado: false, fork: false, ultimo_commit_em: '2026-11-20T10:00:00Z', url: 'https://github.com/lucas/a' },
      { nome_completo: 'lucas/b', privado: false, arquivado: true, fork: false, ultimo_commit_em: null, url: 'https://github.com/lucas/b' },
    ]);
    expect(requisicoes[0].headers.Authorization).toBe('Bearer tok');
    expect(requisicoes[0].headers['X-GitHub-Api-Version']).toBe('2022-11-28');
  });

  it('cria o repositório sempre privado', async () => {
    const { fetch, requisicoes } = githubFalso({ [`POST ${BASE}/user/repos`]: { status: 201, corpo: bruto('site-ana') } });
    const repo = await criarClienteGithub({ token: 'tok', fetch }).criarRepositorio('site-ana');
    expect(requisicoes[0].corpo).toEqual({ name: 'site-ana', private: true, auto_init: false });
    expect(repo.nome_completo).toBe('lucas/site-ana');
    expect(repo.privado).toBe(true);
  });

  it('devolve o usuário do token', async () => {
    const { fetch } = githubFalso({ [`${BASE}/user`]: { login: 'lucas' } });
    expect(await criarClienteGithub({ token: 'tok', fetch }).usuario()).toBe('lucas');
  });

  it('401 e 403 viram token inválido, com mensagem em português', async () => {
    for (const status of [401, 403]) {
      const { fetch } = githubFalso({ [`${BASE}/user`]: { status, corpo: { message: 'Bad credentials' } } });
      const erro = await criarClienteGithub({ token: 'x', fetch }).usuario().catch((e) => e);
      expect(erro).toBeInstanceOf(ErroGithub);
      expect(erro).toMatchObject({ status, tokenInvalido: true, message: 'Token do GitHub inválido ou sem permissão. Cole um novo em Configurações → GitHub.' });
    }
  });

  it('erro de rede vira ErroGithub com mensagem de internet', async () => {
    const fetch = async () => { throw new TypeError('fetch failed'); };
    const erro = await criarClienteGithub({ token: 'x', fetch }).usuario().catch((e) => e);
    expect(erro).toBeInstanceOf(ErroGithub);
    expect(erro.message).toBe('Não foi possível falar com o GitHub. Verifique a internet.');
    expect(erro.status).toBe(0);
  });

  it('commits por semana: converte epoch em data; 202 vira calculando', async () => {
    const semana = Date.UTC(2026, 10, 15) / 1000; // 2026-11-15
    const { fetch } = githubFalso({
      [`${BASE}/repos/lucas/a/stats/commit_activity`]: [{ week: semana, total: 7, days: [] }],
      [`${BASE}/repos/lucas/b/stats/commit_activity`]: { status: 202, corpo: {} },
    });
    const cliente = criarClienteGithub({ token: 'tok', fetch });
    expect(await cliente.commitsPorSemana('lucas/a')).toEqual({ semanas: [{ semana: '2026-11-15', total: 7 }], calculando: false });
    expect(await cliente.commitsPorSemana('lucas/b')).toEqual({ semanas: [], calculando: true });
  });

  it('repositório inexistente vira ErroGithub 404', async () => {
    const { fetch } = githubFalso({});
    const erro = await criarClienteGithub({ token: 'x', fetch }).commitsPorSemana('lucas/sumiu').catch((e) => e);
    expect(erro.status).toBe(404);
    expect(erro.message).toBe('Repositório não encontrado no GitHub.');
  });
});
