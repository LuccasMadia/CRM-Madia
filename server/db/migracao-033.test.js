import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from './connection.js';

const t = '2026-10-01T00:00:00.000Z';

describe('migration 033_orcamento_desconto_valor', () => {
  it('orçamentos antigos ficam sem desconto em reais e valor negativo é recusado', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    migrate(db, { ate: '032_tarefas_modelos.sql' });
    db.prepare('INSERT INTO clientes (id, nome, criado_em, atualizado_em) VALUES (1, ?, ?, ?)').run('Filinto', t, t);
    db.prepare('INSERT INTO orcamentos (id, cliente_id, data, criado_em, atualizado_em) VALUES (1, 1, ?, ?, ?)').run('2026-10-21', t, t);

    migrate(db);

    expect(db.prepare('SELECT desconto_valor_centavos FROM orcamentos WHERE id = 1').get().desconto_valor_centavos).toBeNull();
    db.prepare('UPDATE orcamentos SET desconto_valor_centavos = 20000 WHERE id = 1').run();
    expect(() => db.prepare('UPDATE orcamentos SET desconto_valor_centavos = -1 WHERE id = 1').run()).toThrow();
  });
});
