import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from './connection.js';
import { obterConfig } from '../repos/config.js';

const t = '2026-10-01T00:00:00.000Z';

function bancoNovo() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);
  return db;
}

describe('migration 027_orcamentos', () => {
  it('cria a tabela de preços com os 9 serviços na ordem da spec', () => {
    const db = bancoNovo();
    const linhas = db
      .prepare('SELECT nome, tipo, valor_unico_centavos, valor_mensal_centavos, hospedagem FROM tabela_servicos ORDER BY ordem, id')
      .all()
      .map((r) => ({ ...r }));
    expect(linhas).toEqual([
      { nome: 'Landing page', tipo: 'comum', valor_unico_centavos: 60000, valor_mensal_centavos: null, hospedagem: 'opcional' },
      { nome: 'Cardápio / catálogo digital', tipo: 'comum', valor_unico_centavos: 90000, valor_mensal_centavos: null, hospedagem: 'obrigatoria' },
      { nome: 'Site institucional (até 5 páginas)', tipo: 'comum', valor_unico_centavos: 120000, valor_mensal_centavos: null, hospedagem: 'opcional' },
      { nome: 'Sistema de agendamento', tipo: 'comum', valor_unico_centavos: 150000, valor_mensal_centavos: null, hospedagem: 'obrigatoria' },
      { nome: 'Loja online', tipo: 'comum', valor_unico_centavos: 200000, valor_mensal_centavos: null, hospedagem: 'obrigatoria' },
      { nome: 'Configuração do Google Meu Negócio', tipo: 'gmn_config', valor_unico_centavos: null, valor_mensal_centavos: null, hospedagem: 'nao_se_aplica' },
      { nome: 'Gestão do Google Meu Negócio', tipo: 'comum', valor_unico_centavos: null, valor_mensal_centavos: 15000, hospedagem: 'nao_se_aplica' },
      { nome: 'Placa NFC', tipo: 'placa', valor_unico_centavos: null, valor_mensal_centavos: null, hospedagem: 'nao_se_aplica' },
      { nome: 'Hospedagem e suporte', tipo: 'hospedagem', valor_unico_centavos: null, valor_mensal_centavos: 15000, hospedagem: 'nao_se_aplica' },
    ]);
    expect(db.prepare('SELECT frase FROM tabela_servicos WHERE nome = ?').get('Placa NFC').frase)
      .toBe('Encosta o celular e abre a avaliação no Google');
  });

  it('cria o pacote Presença Local com a gestão do GMN opcional', () => {
    const db = bancoNovo();
    const pacotes = db.prepare('SELECT id, nome FROM tabela_pacotes').all();
    expect(pacotes.map((p) => p.nome)).toEqual(['Presença Local']);
    const itens = db
      .prepare(`SELECT s.nome, i.opcional, i.quantidade, i.placa_modelo_id FROM tabela_pacotes_itens i
                JOIN tabela_servicos s ON s.id = i.servico_id WHERE i.pacote_id = ? ORDER BY i.ordem`)
      .all(pacotes[0].id)
      .map((r) => ({ ...r }));
    expect(itens).toEqual([
      { nome: 'Placa NFC', opcional: 0, quantidade: 1, placa_modelo_id: null },
      { nome: 'Configuração do Google Meu Negócio', opcional: 0, quantidade: 1, placa_modelo_id: null },
      { nome: 'Gestão do Google Meu Negócio', opcional: 1, quantidade: 1, placa_modelo_id: null },
    ]);
  });

  it('define o desconto de combo padrão em 10%', () => {
    expect(obterConfig(bancoNovo(), 'orcamento_desconto_combo_pct')).toBe('10');
  });

  it('não reaproveita número de orçamento apagado', () => {
    const db = bancoNovo();
    db.prepare('INSERT INTO clientes (nome, criado_em, atualizado_em) VALUES (?, ?, ?)').run('Filinto', t, t);
    const clienteId = db.prepare('SELECT id FROM clientes WHERE nome = ?').get('Filinto').id;
    const criar = () =>
      Number(db.prepare('INSERT INTO orcamentos (cliente_id, data, criado_em, atualizado_em) VALUES (?, ?, ?, ?)')
        .run(clienteId, '2026-10-21', t, t).lastInsertRowid);
    expect(criar()).toBe(1);
    expect(criar()).toBe(2);
    db.prepare('DELETE FROM orcamentos WHERE id = 2').run();
    expect(criar()).toBe(3);
  });
});
