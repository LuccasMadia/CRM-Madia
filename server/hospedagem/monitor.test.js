import { describe, it, expect, beforeEach } from 'vitest';
import { openDb } from '../db/connection.js';
import { repoHospedagens } from '../repos/hospedagens.js';
import { definirConfig } from '../repos/config.js';
import { fetchFalso } from '../test/instagramFalso.js';
import { criarMonitor } from './monitor.js';

const t = '2026-10-01T00:00:00.000Z';
const SITE = 'https://site.test/';
const AGORA = new Date('2026-10-19T12:00:00.000Z');
let db;
let repo;

beforeEach(() => {
  db = openDb(':memory:');
  db.prepare('INSERT INTO clientes (id, nome, criado_em, atualizado_em) VALUES (1, ?, ?, ?)').run('Ana', t, t);
  db.prepare('INSERT INTO projetos (id, cliente_id, titulo, servico, criado_em, atualizado_em) VALUES (1, 1, ?, ?, ?, ?)').run(
    'Site', 'site_sistema', t, t,
  );
  repo = repoHospedagens(db);
  repo.salvarCadastro(1, { tipo: 'vercel', url: SITE, vercel_projeto_id: 'prj_1', vercel_projeto_nome: 'x' });
});

const monitorCom = (rotas) => {
  const falso = fetchFalso(rotas);
  return { ...falso, monitor: criarMonitor({ db, fetch: falso.fetch, agora: () => AGORA }) };
};
const fora = { status: 503, corpo: {} };
const no_ar = { status: 200, corpo: {} };

describe('monitor de sites', () => {
  it('uma falha so conta; duas viram fora do ar', async () => {
    const { monitor } = monitorCom({ [SITE]: fora });
    await monitor.checarTodos();
    expect(repo.obter(1)).toMatchObject({
      status: 'desconhecido',
      falhas_seguidas: 1,
      ultimo_motivo: 'Erro 503',
      ultima_checagem: AGORA.toISOString(),
    });
    await monitor.checarTodos();
    expect(repo.obter(1)).toMatchObject({ status: 'fora_do_ar', falhas_seguidas: 2, status_desde: AGORA.toISOString() });
  });

  it('volta ao ar', async () => {
    repo.atualizar(1, { status: 'fora_do_ar', falhas_seguidas: 3, ultimo_motivo: 'Erro 503' });
    const { monitor } = monitorCom({ [SITE]: no_ar });
    await monitor.checarTodos();
    expect(repo.obter(1)).toMatchObject({ status: 'no_ar', falhas_seguidas: 0, ultimo_motivo: null, status_desde: AGORA.toISOString() });
  });

  it('no ar continuo nao muda status_desde', async () => {
    repo.atualizar(1, { status: 'no_ar', status_desde: t });
    const { monitor } = monitorCom({ [SITE]: no_ar });
    await monitor.checarTodos();
    expect(repo.obter(1).status_desde).toBe(t);
  });

  it('duas falhas com a Vercel dizendo pausado viram pausado', async () => {
    definirConfig(db, 'vercel_token', 'tok');
    const { monitor } = monitorCom({ [SITE]: fora, 'https://api.vercel.com/v9/projects/prj_1': { paused: true } });
    await monitor.checarTodos();
    await monitor.checarTodos();
    expect(repo.obter(1).status).toBe('pausado');
    expect(repo.listarPausas(1)).toEqual([]);
  });

  it('consulta a Vercel falhando cai em fora do ar', async () => {
    definirConfig(db, 'vercel_token', 'tok');
    const { monitor } = monitorCom({ [SITE]: fora, 'https://api.vercel.com/v9/projects/prj_1': { status: 401, corpo: {} } });
    await monitor.checarTodos();
    await monitor.checarTodos();
    expect(repo.obter(1).status).toBe('fora_do_ar');
  });

  it('pausado durante a checagem: resultado descartado', async () => {
    repo.atualizar(1, { falhas_seguidas: 1 });
    const { monitor } = monitorCom({
      [SITE]: () => {
        db.prepare("UPDATE hospedagens SET status = 'pausado'").run();
        return fora;
      },
    });
    await monitor.checarTodos();
    expect(repo.obter(1)).toMatchObject({ status: 'pausado', falhas_seguidas: 1 });
  });

  it('url trocada durante a checagem: resultado descartado', async () => {
    const { monitor } = monitorCom({
      [SITE]: () => {
        repo.salvarCadastro(1, { tipo: 'vercel', url: 'https://outro.test/' });
        return fora;
      },
    });
    await monitor.checarTodos();
    expect(repo.obter(1)).toMatchObject({ falhas_seguidas: 0, ultima_checagem: null });
  });

  it('chamadas simultaneas dividem uma rodada', async () => {
    const { monitor, requisicoes } = monitorCom({ [SITE]: no_ar });
    await Promise.all([monitor.checarTodos(), monitor.checarTodos()]);
    expect(requisicoes.filter((r) => r.url.href === SITE)).toHaveLength(1);
  });

  it('erro de rede conta como falha', async () => {
    const { monitor } = monitorCom({
      [SITE]: () => {
        throw new DOMException('x', 'TimeoutError');
      },
    });
    await monitor.checarTodos();
    expect(repo.obter(1).ultimo_motivo).toBe('Sem resposta em 10 s');
  });
});
