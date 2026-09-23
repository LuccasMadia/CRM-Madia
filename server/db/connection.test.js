import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
