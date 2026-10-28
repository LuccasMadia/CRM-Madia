import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from './connection.js';

const t = '2026-10-01T00:00:00.000Z';

describe('migration 034_orcamento_mes_gratis', () => {
  it('itens antigos ficam sem mês grátis e só aceita 0 ou 1', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    migrate(db, { ate: '033_orcamento_desconto_valor.sql' });
    db.prepare('INSERT INTO clientes (id, nome, criado_em, atualizado_em) VALUES (1, ?, ?, ?)').run('Filinto', t, t);
    db.prepare('INSERT INTO orcamentos (id, cliente_id, data, criado_em, atualizado_em) VALUES (1, 1, ?, ?, ?)').run('2026-10-21', t, t);
    db.prepare('INSERT INTO orcamento_itens (id, orcamento_id, nome, valor_mensal_centavos, ordem, criado_em, atualizado_em) VALUES (1, 1, ?, 15000, 0, ?, ?)').run('Gestão', t, t);

    migrate(db);

    expect(db.prepare('SELECT primeiro_mes_gratis FROM orcamento_itens WHERE id = 1').get().primeiro_mes_gratis).toBe(0);
    db.prepare('UPDATE orcamento_itens SET primeiro_mes_gratis = 1 WHERE id = 1').run();
    expect(() => db.prepare('UPDATE orcamento_itens SET primeiro_mes_gratis = 2 WHERE id = 1').run()).toThrow();
  });
});
