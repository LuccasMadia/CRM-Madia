import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../db/connection.js';
import { repoTabelaServicos, repoTabelaPacotes, repoOrcamentos, repoOrcamentoItens } from './orcamentos.js';

const t = '2026-10-01T00:00:00.000Z';

function bancoNovo() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);
  db.prepare('INSERT INTO clientes (nome, criado_em, atualizado_em) VALUES (?, ?, ?)').run('Filinto', t, t);
  return db;
}

describe('repositórios de orçamentos', () => {
  it('lista só os serviços ativos e sabe quando um serviço está em uso', () => {
    const db = bancoNovo();
    const servicos = repoTabelaServicos(db);
    const landing = servicos.listar({ nome: 'Landing page' })[0];
    const hospedagem = servicos.listar({ nome: 'Hospedagem e suporte' })[0];
    servicos.atualizar(hospedagem.id, { ativo: 0 });
    expect(servicos.listarAtivos()).toHaveLength(8);
    expect(servicos.emUso(landing.id)).toBe(false);
    const orc = repoOrcamentos(db).criar({ cliente_id: 1, data: '2026-10-21' });
    repoOrcamentoItens(db).criar({ orcamento_id: orc.id, servico_id: landing.id, nome: 'Landing page', ordem: 0 });
    expect(servicos.emUso(landing.id)).toBe(true);
    // Presença Local usa a Placa NFC.
    expect(servicos.emUso(servicos.listar({ nome: 'Placa NFC' })[0].id)).toBe(true);
  });

  it('lista pacotes com itens e substitui os itens', () => {
    const db = bancoNovo();
    const pacotes = repoTabelaPacotes(db);
    const [p] = pacotes.listarComItens();
    expect(p.nome).toBe('Presença Local');
    expect(p.itens.map((i) => i.opcional)).toEqual([0, 0, 1]);
    pacotes.substituirItens(p.id, [{ servico_id: p.itens[2].servico_id, opcional: true }]);
    const [depois] = pacotes.listarComItens();
    expect(depois.itens).toHaveLength(1);
    expect(depois.itens[0]).toMatchObject({ opcional: 1, quantidade: 1, ordem: 0 });
  });

  it('salvar pacote é atômico: erro nos itens desfaz o pacote inteiro', () => {
    const db = bancoNovo();
    const pacotes = repoTabelaPacotes(db);
    const [p] = pacotes.listarComItens();
    expect(() => pacotes.salvar(null, { nome: 'Novo' }, [{ servico_id: 99999 }])).toThrow();
    expect(() => pacotes.salvar(p.id, { nome: 'Renomeado' }, [{ servico_id: 99999 }])).toThrow();
    const depois = pacotes.listarComItens();
    expect(depois).toHaveLength(1);
    expect(depois[0].nome).toBe('Presença Local');
    expect(depois[0].itens).toHaveLength(3);
  });

  it('lista orçamentos do cliente do mais novo e itens por ordem', () => {
    const db = bancoNovo();
    const orcs = repoOrcamentos(db);
    const a = orcs.criar({ cliente_id: 1, data: '2026-10-20' });
    const b = orcs.criar({ cliente_id: 1, data: '2026-10-21' });
    expect(orcs.listarDoCliente(1).map((o) => o.id)).toEqual([b.id, a.id]);
    expect(b).toMatchObject({ validade_dias: 15, pagamento: 'a combinar', prazo: 'a combinar', situacao: 'rascunho', desconto_pct: null });
    const itens = repoOrcamentoItens(db);
    expect(itens.proximaOrdem(a.id)).toBe(0);
    itens.criar({ orcamento_id: a.id, nome: 'B', ordem: 1 });
    itens.criar({ orcamento_id: a.id, nome: 'A', ordem: 0 });
    expect(itens.listarDo(a.id).map((i) => i.nome)).toEqual(['A', 'B']);
    expect(itens.proximaOrdem(a.id)).toBe(2);
  });
});
