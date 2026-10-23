import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from './connection.js';

const t = '2026-10-01T00:00:00.000Z';

describe('migration 030_orcamento_gerou', () => {
  it('liga projetos e vendas de placa ao orçamento e solta a ligação quando o orçamento é apagado', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    migrate(db, { ate: '029_tarefas_sem_projeto.sql' });
    db.prepare('INSERT INTO clientes (id, nome, criado_em, atualizado_em) VALUES (1, ?, ?, ?)').run('Filinto', t, t);
    db.prepare("INSERT INTO projetos (id, cliente_id, titulo, servico, criado_em, atualizado_em) VALUES (1, 1, 'Antigo', 'site_sistema', ?, ?)").run(t, t);

    migrate(db);

    // o que já existia fica sem orçamento
    expect(db.prepare('SELECT orcamento_id FROM projetos WHERE id = 1').get().orcamento_id).toBeNull();
    db.prepare('INSERT INTO orcamentos (id, cliente_id, data, criado_em, atualizado_em) VALUES (5, 1, ?, ?, ?)').run('2026-10-21', t, t);
    db.prepare('UPDATE projetos SET orcamento_id = 5 WHERE id = 1').run();
    db.prepare('INSERT INTO placas_modelos (id, nome, preco_venda_centavos, criado_em, atualizado_em) VALUES (1, ?, 8000, ?, ?)').run('Redonda', t, t);
    db.prepare(`INSERT INTO placas_vendas (modelo_id, quantidade, preco_vendido_centavos, custo_unitario_centavos, cliente_id, data_venda, orcamento_id, criado_em, atualizado_em)
                VALUES (1, 1, 8000, 100, 1, '2026-10-21', 5, ?, ?)`).run(t, t);
    expect(() => db.prepare('UPDATE projetos SET orcamento_id = 99 WHERE id = 1').run()).toThrow();

    db.prepare('DELETE FROM orcamentos WHERE id = 5').run();
    expect(db.prepare('SELECT orcamento_id FROM projetos WHERE id = 1').get().orcamento_id).toBeNull();
    expect(db.prepare('SELECT orcamento_id FROM placas_vendas').get().orcamento_id).toBeNull();
    expect(db.prepare('SELECT COUNT(*) AS n FROM projetos').get().n).toBe(1);
  });

  it('marca o projeto vinculado e as parcelas que o aceite criou', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    migrate(db, { ate: '029_tarefas_sem_projeto.sql' });
    db.prepare('INSERT INTO clientes (id, nome, criado_em, atualizado_em) VALUES (1, ?, ?, ?)').run('Filinto', t, t);
    db.prepare("INSERT INTO projetos (id, cliente_id, titulo, servico, criado_em, atualizado_em) VALUES (1, 1, 'Cardápio', 'site_sistema', ?, ?)").run(t, t);
    db.prepare("INSERT INTO parcelas (id, projeto_id, valor_centavos, vencimento, criado_em, atualizado_em) VALUES (1, 1, 100, '2026-10-01', ?, ?)").run(t, t);

    migrate(db);

    // o que já existia não foi vinculado nem criado por orçamento
    expect({ ...db.prepare('SELECT orcamento_id, orcamento_vinculado FROM projetos WHERE id = 1').get() }).toEqual({ orcamento_id: null, orcamento_vinculado: 0 });
    expect(db.prepare('SELECT orcamento_id FROM parcelas WHERE id = 1').get().orcamento_id).toBeNull();
    expect(() => db.prepare('UPDATE projetos SET orcamento_vinculado = 2 WHERE id = 1').run()).toThrow();
    expect(() => db.prepare('UPDATE parcelas SET orcamento_id = 99 WHERE id = 1').run()).toThrow();

    db.prepare('INSERT INTO orcamentos (id, cliente_id, data, criado_em, atualizado_em) VALUES (5, 1, ?, ?, ?)').run('2026-10-21', t, t);
    db.prepare('UPDATE projetos SET orcamento_id = 5, orcamento_vinculado = 1 WHERE id = 1').run();
    db.prepare('UPDATE parcelas SET orcamento_id = 5 WHERE id = 1').run();
    db.prepare('DELETE FROM orcamentos WHERE id = 5').run();
    // apagar o orçamento solta a parcela, mas ela continua no projeto
    expect({ ...db.prepare('SELECT projeto_id, orcamento_id FROM parcelas WHERE id = 1').get() }).toEqual({ projeto_id: 1, orcamento_id: null });
  });
});
