import { describe, it, expect, beforeEach } from 'vitest';
import { criarContexto } from '../test/contexto.js';
import { githubFalso } from '../test/githubFalso.js';

const BASE = 'https://api.github.com';
const LISTA = `${BASE}/user/repos?per_page=100&affiliation=owner`;
const bruto = (nome, extra = {}) => ({
  full_name: `lucas/${nome}`, private: true, archived: false, fork: false, pushed_at: '2026-11-20T10:00:00Z', html_url: `https://github.com/lucas/${nome}`, ...extra,
});

let ctx;
let github;
let cliente;
async function montar(rotas = {}) {
  github = githubFalso({ [`${BASE}/user`]: { login: 'lucas' }, [LISTA]: [], ...rotas });
  ctx = criarContexto({ fetch: github.fetch });
  cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
}
const conectar = () => ctx.http.put('/api/github/conexao').send({ token: 'ghp_segredo' }).expect(200);
const novoProjeto = async (dados = {}) => (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Site Ana', ...dados }).expect(201)).body;
const ligar = (projeto, repo) => ctx.http.put(`/api/projetos/${projeto.id}`).send({ github_repo: repo }).expect(200);
const chamadasA = (metodo, caminho) => github.requisicoes.filter((r) => r.metodo === metodo && r.url.pathname === caminho).length;

beforeEach(() => montar());

describe('conexão', () => {
  it('conecta, guarda o token sem devolvê-lo e desconecta', async () => {
    expect((await ctx.http.get('/api/github').expect(200)).body).toEqual({ conectado: false, usuario: null });
    const res = await conectar();
    expect(res.body).toEqual({ conectado: true, usuario: 'lucas' });
    expect(JSON.stringify((await ctx.http.get('/api/github')).body)).not.toContain('ghp_segredo');
    expect((await ctx.http.delete('/api/github/conexao').expect(200)).body).toEqual({ conectado: false, usuario: null });
  });

  it('token inválido é recusado com erro no campo token e nada é guardado', async () => {
    await montar({ [`${BASE}/user`]: { status: 401, corpo: { message: 'Bad credentials' } } });
    const res = await ctx.http.put('/api/github/conexao').send({ token: 'ruim' }).expect(400);
    expect(res.body.erros[0].campo).toBe('token');
    expect((await ctx.http.get('/api/github')).body.conectado).toBe(false);
  });
});

describe('auditoria', () => {
  it('sem token devolve 409 pedindo para conectar', async () => {
    const res = await ctx.http.get('/api/github/repositorios').expect(409);
    expect(res.body.erro).toBe('Conecte o GitHub em Configurações.');
  });

  it('cruza repositórios e projetos, e usa o cache por 10 minutos (atualizar=1 força)', async () => {
    await montar({ [LISTA]: [bruto('site-ana', { private: false }), bruto('solto')] });
    const projeto = await novoProjeto({ etapa: 'entregue' });
    await ligar(projeto, 'lucas/site-ana');
    await conectar();
    const res = (await ctx.http.get('/api/github/repositorios').expect(200)).body;
    expect(res.alertas.map((a) => a.codigo).sort()).toEqual(['publico_entregue', 'sem_projeto']);
    await ctx.http.get('/api/github/repositorios').expect(200);
    expect(chamadasA('GET', '/user/repos')).toBe(1);
    await ctx.http.get('/api/github/repositorios?atualizar=1').expect(200);
    expect(chamadasA('GET', '/user/repos')).toBe(2);
  });
});

describe('repositório do projeto', () => {
  it('POST cria o repositório privado, liga ao projeto e devolve visibilidade', async () => {
    const criados = [];
    await montar({
      [LISTA]: () => criados,
      [`POST ${BASE}/user/repos`]: ({ corpo }) => { criados.push(bruto(corpo.name)); return { status: 201, corpo: bruto(corpo.name) }; },
      [`${BASE}/repos/lucas/site-ana/stats/commit_activity`]: [],
    });
    await conectar();
    const projeto = await novoProjeto({ ficticio: true });
    const res = (await ctx.http.post(`/api/projetos/${projeto.id}/github`).expect(200)).body;
    const criacao = github.requisicoes.find((r) => r.metodo === 'POST');
    expect(criacao.corpo).toEqual({ name: 'site-ana', private: true, auto_init: false });
    expect(res).toMatchObject({ repo: 'lucas/site-ana', visibilidade: 'privado', encontrado: true });
    expect((await ctx.http.get(`/api/projetos/${projeto.id}`)).body.github_repo).toBe('lucas/site-ana');
    await ctx.http.post(`/api/projetos/${projeto.id}/github`).expect(409);
    expect(chamadasA('POST', '/user/repos')).toBe(1);
  });

  it('nome já usado no GitHub ganha sufixo -2', async () => {
    const criados = [bruto('site-ana')];
    await montar({
      [LISTA]: () => criados,
      [`POST ${BASE}/user/repos`]: ({ corpo }) => { criados.push(bruto(corpo.name)); return { status: 201, corpo: bruto(corpo.name) }; },
      [`${BASE}/repos/lucas/site-ana-2/stats/commit_activity`]: [],
    });
    await conectar();
    const projeto = await novoProjeto();
    const res = (await ctx.http.post(`/api/projetos/${projeto.id}/github`).expect(200)).body;
    expect(res.repo).toBe('lucas/site-ana-2');
  });

  it('falha do GitHub ao criar vira 502 com a mensagem e o projeto fica sem repositório', async () => {
    await montar({ [`POST ${BASE}/user/repos`]: { status: 403, corpo: {} } });
    await conectar();
    const projeto = await novoProjeto();
    const res = await ctx.http.post(`/api/projetos/${projeto.id}/github`).expect(502);
    expect(res.body.erro).toMatch(/Token do GitHub inválido/);
    expect((await ctx.http.get(`/api/projetos/${projeto.id}`)).body.github_repo).toBeNull();
  });

  it('GET devolve visibilidade e commits; repositório apagado no GitHub vira encontrado:false com 200', async () => {
    const semana = Date.UTC(2026, 10, 15) / 1000;
    await montar({
      [LISTA]: [bruto('site-ana', { private: false })],
      [`${BASE}/repos/lucas/site-ana/stats/commit_activity`]: [{ week: semana, total: 4, days: [] }],
    });
    await conectar();
    const ok = await novoProjeto();
    await ligar(ok, 'lucas/site-ana');
    expect((await ctx.http.get(`/api/projetos/${ok.id}/github`).expect(200)).body).toEqual({
      repo: 'lucas/site-ana', visibilidade: 'publico', encontrado: true, commits: { semanas: [{ semana: '2026-11-15', total: 4 }], calculando: false },
    });
    const sumido = await novoProjeto({ titulo: 'Outro' });
    await ligar(sumido, 'lucas/sumiu');
    expect((await ctx.http.get(`/api/projetos/${sumido.id}/github`).expect(200)).body).toEqual({ repo: 'lucas/sumiu', visibilidade: null, encontrado: false, commits: null });
    const sem = await novoProjeto({ titulo: 'Sem' });
    expect((await ctx.http.get(`/api/projetos/${sem.id}/github`).expect(200)).body).toEqual({ repo: null, visibilidade: null, encontrado: false, commits: null });
  });

  it('estatísticas ainda sendo calculadas aparecem como calculando, não como erro', async () => {
    await montar({ [LISTA]: [bruto('site-ana')], [`${BASE}/repos/lucas/site-ana/stats/commit_activity`]: { status: 202, corpo: {} } });
    await conectar();
    const projeto = await novoProjeto();
    await ligar(projeto, 'lucas/site-ana');
    const res = (await ctx.http.get(`/api/projetos/${projeto.id}/github`).expect(200)).body;
    expect(res.commits).toEqual({ semanas: [], calculando: true });
  });
});
