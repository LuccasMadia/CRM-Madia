import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PASTA_MIGRACOES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export function openDb(arquivo = ':memory:') {
  if (arquivo !== ':memory:') mkdirSync(path.dirname(arquivo), { recursive: true });
  const db = new DatabaseSync(arquivo);
  db.exec('PRAGMA foreign_keys = ON;');
  if (arquivo !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  migrate(db);
  return db;
}

export function migrate(db) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (nome TEXT PRIMARY KEY, aplicada_em TEXT NOT NULL)');
  const aplicadas = new Set(db.prepare('SELECT nome FROM schema_migrations').all().map((r) => r.nome));
  const arquivos = readdirSync(PASTA_MIGRACOES).filter((f) => f.endsWith('.sql')).sort();
  for (const arquivo of arquivos) {
    if (aplicadas.has(arquivo)) continue;
    db.exec('BEGIN');
    try {
      db.exec(readFileSync(path.join(PASTA_MIGRACOES, arquivo), 'utf8'));
      db.prepare('INSERT INTO schema_migrations (nome, aplicada_em) VALUES (?, ?)').run(arquivo, new Date().toISOString());
      db.exec('COMMIT');
    } catch (erro) {
      db.exec('ROLLBACK');
      throw erro;
    }
  }
}
