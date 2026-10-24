import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from './connection.js';

const t = '2026-10-14T13:00:00.000Z';

describe('migration 032_tarefas_modelos', () => {
  it('semeia os modelos, liga tarefas a parcela ou venda e solta a ligação quando o dinheiro é apagado', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    migrate(db, { ate: '031_tarefas_completas.sql' });
    db.prepare('INSERT INTO clientes (id, nome, criado_em, atualizado_em) VALUES (1, ?, ?, ?)').run('House', t, t);
    db.prepare("INSERT INTO projetos (id, cliente_id, titulo, servico, criado_em, atualizado_em) VALUES (1, 1, 'Site', 'site_sistema', ?, ?)").run(t, t);
    db.prepare("INSERT INTO tarefas (id, projeto_id, cliente_id, texto, criado_em, atualizado_em) VALUES (1, 1, 1, 'Cobrar', ?, ?)").run(t, t);

    migrate(db);

    expect(db.prepare('SELECT parcela_id, placa_venda_id FROM tarefas WHERE id = 1').get()).toEqual({ parcela_id: null, placa_venda_id: null });
    const modelos = db.prepare('SELECT m.nome, COUNT(i.id) AS itens FROM tarefas_modelos m JOIN tarefas_modelos_itens i ON i.modelo_id = m.id GROUP BY m.id ORDER BY m.id').all().map((l) => ({ ...l }));
    expect(modelos).toEqual([{ nome: 'Site', itens: 7 }, { nome: 'Google Meu Negócio', itens: 5 }, { nome: 'Placas NFC', itens: 4 }]);

    db.prepare("INSERT INTO parcelas (id, projeto_id, valor_centavos, vencimento, criado_em, atualizado_em) VALUES (1, 1, 100, '2026-10-30', ?, ?)").run(t, t);
    db.prepare('UPDATE tarefas SET parcela_id = 1 WHERE id = 1').run();
    expect(() => db.prepare('UPDATE tarefas SET placa_venda_id = 99 WHERE id = 1').run()).toThrow();
    db.prepare('DELETE FROM parcelas WHERE id = 1').run();
    expect(db.prepare('SELECT parcela_id FROM tarefas WHERE id = 1').get().parcela_id).toBeNull();

    db.prepare('DELETE FROM tarefas_modelos WHERE id = 1').run();
    expect(db.prepare('SELECT COUNT(*) AS n FROM tarefas_modelos_itens WHERE modelo_id = 1').get().n).toBe(0);
  });
});
