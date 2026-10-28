import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from './connection.js';

const t = '2026-10-01T00:00:00.000Z';

describe('migration 035_lojas', () => {
  it('projetos e vendas antigos ficam sem loja; apagar a loja só solta o projeto', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    migrate(db, { ate: '034_orcamento_mes_gratis.sql' });
    db.prepare('INSERT INTO clientes (id, nome, criado_em, atualizado_em) VALUES (1, ?, ?, ?)').run('Fotcell', t, t);
    db.prepare("INSERT INTO projetos (id, cliente_id, titulo, etapa, servico, criado_em, atualizado_em) VALUES (1, 1, 'GMN', 'andamento', 'google_meu_negocio', ?, ?)").run(t, t);

    migrate(db);

    expect(db.prepare('SELECT loja_id FROM projetos WHERE id = 1').get().loja_id).toBeNull();
    db.prepare("INSERT INTO lojas (id, cliente_id, nome, criado_em, atualizado_em) VALUES (1, 1, 'Vila Alegre', ?, ?)").run(t, t);
    db.prepare('UPDATE projetos SET loja_id = 1 WHERE id = 1').run();
    db.prepare('DELETE FROM lojas WHERE id = 1').run();
    expect(db.prepare('SELECT loja_id FROM projetos WHERE id = 1').get().loja_id).toBeNull();
  });
});
