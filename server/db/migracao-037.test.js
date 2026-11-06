import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from './connection.js';

const t = '2026-10-01T00:00:00.000Z';

describe('migration 037_gmn_config_sem_mensal', () => {
  it('tira o valor mensal dos itens da configuração do GMN e mantém o da gestão', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    migrate(db, { ate: '036_gmn_frases_gestao_brinde.sql' });
    const idDe = (tipo) => db.prepare('SELECT id FROM tabela_servicos WHERE tipo = ? ORDER BY id').get(tipo).id;
    db.prepare('INSERT INTO clientes (id, nome, criado_em, atualizado_em) VALUES (1, ?, ?, ?)').run('Filinto', t, t);
    db.prepare('INSERT INTO orcamentos (id, cliente_id, data, criado_em, atualizado_em) VALUES (1, 1, ?, ?, ?)').run('2026-10-21', t, t);
    const item = db.prepare('INSERT INTO orcamento_itens (id, orcamento_id, servico_id, nome, valor_unico_centavos, valor_mensal_centavos, ordem, criado_em, atualizado_em) VALUES (?, 1, ?, ?, ?, ?, 0, ?, ?)');
    item.run(1, idDe('gmn_config'), 'Configuração', 25000, 10000, t, t);
    item.run(2, idDe('comum'), 'Gestão', null, 15000, t, t);

    migrate(db);

    expect(db.prepare('SELECT valor_mensal_centavos m, valor_unico_centavos u FROM orcamento_itens WHERE id = 1').get()).toMatchObject({ m: null, u: 25000 });
    expect(db.prepare('SELECT valor_mensal_centavos m FROM orcamento_itens WHERE id = 2').get().m).toBe(15000);
  });
});
