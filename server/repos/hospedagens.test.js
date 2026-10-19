import { describe, it, expect, beforeEach } from 'vitest';
import { openDb } from '../db/connection.js';
import { repoHospedagens } from './hospedagens.js';

let db;
let repo;
const t = '2026-10-01T00:00:00.000Z';

function criarProjeto(id) {
  db.prepare('INSERT INTO projetos (id, cliente_id, titulo, servico, criado_em, atualizado_em) VALUES (?, 1, ?, ?, ?, ?)').run(
    id, `Site ${id}`, 'site_sistema', t, t,
  );
}

beforeEach(() => {
  db = openDb(':memory:');
  db.prepare('INSERT INTO clientes (id, nome, criado_em, atualizado_em) VALUES (1, ?, ?, ?)').run('Ana', t, t);
  criarProjeto(1);
  criarProjeto(2);
  criarProjeto(3);
  repo = repoHospedagens(db);
});

const vercel = (url, extra = {}) => ({ tipo: 'vercel', url, vercel_projeto_id: 'prj_1', vercel_projeto_nome: 'rango', ...extra });

describe('repoHospedagens', () => {
  it('obter devolve null sem cadastro', () => {
    expect(repo.obter(1)).toBeNull();
  });

  it('salvarCadastro cria e depois atualiza a mesma linha', () => {
    const criada = repo.salvarCadastro(1, vercel('https://a.com.br'));
    expect(criada).toMatchObject({ projeto_id: 1, tipo: 'vercel', url: 'https://a.com.br', status: 'desconhecido', vercel_projeto_id: 'prj_1' });
    repo.salvarCadastro(1, { tipo: 'sem_hospedagem', url: null, vercel_projeto_id: null, vercel_projeto_nome: null });
    expect(db.prepare('SELECT COUNT(*) AS n FROM hospedagens').get().n).toBe(1);
    expect(repo.obter(1)).toMatchObject({ tipo: 'sem_hospedagem', url: null, status: 'desconhecido' });
  });

  it('trocar a url de um site no ar volta para desconhecido e zera as falhas', () => {
    repo.salvarCadastro(1, vercel('https://a.com.br'));
    repo.atualizar(1, { status: 'no_ar', status_desde: t, falhas_seguidas: 1, ultimo_motivo: 'x', ultima_checagem: t });
    repo.salvarCadastro(1, vercel('https://b.com.br'));
    expect(repo.obter(1)).toMatchObject({
      status: 'desconhecido', status_desde: null, falhas_seguidas: 0, ultimo_motivo: null, ultima_checagem: null,
    });
  });

  it('manter a mesma url preserva o status', () => {
    repo.salvarCadastro(1, vercel('https://a.com.br'));
    repo.atualizar(1, { status: 'no_ar', status_desde: t });
    repo.salvarCadastro(1, vercel('https://a.com.br', { vercel_projeto_nome: 'outro' }));
    expect(repo.obter(1)).toMatchObject({ status: 'no_ar', vercel_projeto_nome: 'outro' });
  });

  it('trocar a url de um site pausado mantem pausado', () => {
    repo.salvarCadastro(1, vercel('https://a.com.br'));
    repo.atualizar(1, { status: 'pausado', status_desde: t });
    repo.salvarCadastro(1, vercel('https://b.com.br'));
    expect(repo.obter(1)).toMatchObject({ status: 'pausado', status_desde: t, url: 'https://b.com.br' });
  });

  it('atualizar aceita qualquer subconjunto de campos de status e muda atualizado_em', () => {
    repo.salvarCadastro(1, vercel('https://a.com.br'));
    db.prepare("UPDATE hospedagens SET atualizado_em = 'antigo' WHERE projeto_id = 1").run();
    const l = repo.atualizar(1, { cliente_avisado_em: '2026-10-19' });
    expect(l.cliente_avisado_em).toBe('2026-10-19');
    expect(l.status).toBe('desconhecido');
    expect(l.atualizado_em).not.toBe('antigo');
    expect(repo.atualizar(1, { falhas_seguidas: 2 }).falhas_seguidas).toBe(2);
  });

  it('listarMonitorados nao traz sem_hospedagem, sem url nem pausado', () => {
    repo.salvarCadastro(1, vercel('https://a.com.br'));
    repo.salvarCadastro(2, { tipo: 'sem_hospedagem', url: null, vercel_projeto_id: null, vercel_projeto_nome: null });
    repo.salvarCadastro(3, vercel('https://c.com.br'));
    expect(repo.listarMonitorados().map((h) => h.projeto_id)).toEqual([1, 3]);
    repo.atualizar(3, { status: 'pausado' });
    expect(repo.listarMonitorados().map((h) => h.projeto_id)).toEqual([1]);
    repo.salvarCadastro(1, vercel(null));
    expect(repo.listarMonitorados()).toEqual([]);
    expect(repo.listarTodas().map((h) => h.projeto_id)).toEqual([1, 2, 3]);
  });

  it('listarPausas devolve a mais recente primeiro', () => {
    repo.registrarPausa(1, 'pausou', '2026-10-01T10:00:00.000Z');
    repo.registrarPausa(1, 'religou', '2026-10-02T10:00:00.000Z');
    expect(repo.listarPausas(1)).toEqual([
      { acao: 'religou', em: '2026-10-02T10:00:00.000Z' },
      { acao: 'pausou', em: '2026-10-01T10:00:00.000Z' },
    ]);
  });

  it('apagar o projeto apaga hospedagem e pausas', () => {
    expect(db.prepare('PRAGMA foreign_keys').get().foreign_keys).toBe(1);
    repo.salvarCadastro(1, vercel('https://a.com.br'));
    repo.registrarPausa(1, 'pausou', t);
    db.prepare('DELETE FROM projetos WHERE id = 1').run();
    expect(db.prepare('SELECT COUNT(*) AS n FROM hospedagens').get().n).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS n FROM hospedagem_pausas').get().n).toBe(0);
  });
});
