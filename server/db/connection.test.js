import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { openDb, migrate } from './connection.js';

describe('openDb', () => {
  it('cria todas as tabelas do esquema inicial', () => {
    const db = openDb(':memory:');
    const tabelas = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((t) => t.name);
    expect(tabelas).toEqual(
      expect.arrayContaining([
        'clientes', 'projetos', 'parcelas', 'tarefas', 'portfolio',
        'portfolio_imagens', 'portfolio_case_study', 'conteudos', 'config', 'schema_migrations',
      ]),
    );
  });

  it('não reaplica migrações já registradas', () => {
    const db = openDb(':memory:');
    const antes = db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n;
    migrate(db);
    expect(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n).toBe(antes);
  });

  it('liga as chaves estrangeiras', () => {
    const db = openDb(':memory:');
    const agora = new Date().toISOString();
    expect(() =>
      db
        .prepare('INSERT INTO projetos (cliente_id, titulo, criado_em, atualizado_em) VALUES (999, ?, ?, ?)')
        .run('X', agora, agora),
    ).toThrow(/FOREIGN KEY/);
  });

  it('cria a pasta do arquivo do banco', () => {
    const dir = path.join(mkdtempSync(path.join(os.tmpdir(), 'crm-db-')), 'sub');
    const db = openDb(path.join(dir, 'crm.db'));
    db.close();
    expect(existsSync(path.join(dir, 'crm.db'))).toBe(true);
  });
});

describe('migration 014_placas_packs', () => {
  it('preenche valor_total_centavos das linhas de placas já existentes', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec('CREATE TABLE schema_migrations (nome TEXT PRIMARY KEY, aplicada_em TEXT NOT NULL)');
    const pasta = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
    for (const arquivo of readdirSync(pasta).filter((f) => f.endsWith('.sql') && f < '014').sort()) {
      db.exec(readFileSync(path.join(pasta, arquivo), 'utf8'));
      db.prepare('INSERT INTO schema_migrations (nome, aplicada_em) VALUES (?, ?)').run(arquivo, 'x');
    }
    const t = '2026-10-01T00:00:00.000Z';
    db.prepare('INSERT INTO clientes (id, nome, criado_em, atualizado_em) VALUES (1, ?, ?, ?)').run('Ana', t, t);
    db.prepare('INSERT INTO projetos (id, cliente_id, titulo, criado_em, atualizado_em) VALUES (1, 1, ?, ?, ?)').run('P', t, t);
    db.prepare('INSERT INTO placas_modelos (id, nome, preco_venda_centavos, criado_em, atualizado_em) VALUES (1, ?, 8000, ?, ?)').run('10x10', t, t);
    db.prepare("INSERT INTO projetos_servicos (projeto_id, tipo, modelo_id, quantidade, valor_unitario_centavos, criado_em, atualizado_em) VALUES (1, 'placas_nfc', 1, 2, 7000, ?, ?)").run(t, t);
    db.prepare("INSERT INTO projetos_servicos (projeto_id, tipo, quantidade, valor_unitario_centavos, criado_em, atualizado_em) VALUES (1, 'saas', 1, 5000, ?, ?)").run(t, t);

    migrate(db);

    const linhas = db.prepare('SELECT tipo, valor_total_centavos FROM projetos_servicos ORDER BY id').all().map((r) => ({ ...r }));
    expect(linhas).toEqual([{ tipo: 'placas_nfc', valor_total_centavos: 14000 }, { tipo: 'saas', valor_total_centavos: null }]);
  });
});
