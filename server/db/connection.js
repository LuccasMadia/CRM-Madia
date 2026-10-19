import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PASTA_MIGRACOES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export function openDb(arquivo = ':memory:', opcoes = {}) {
  if (arquivo !== ':memory:') mkdirSync(path.dirname(arquivo), { recursive: true });
  const db = new DatabaseSync(arquivo);
  db.exec('PRAGMA foreign_keys = ON;');
  if (arquivo !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  migrate(db, opcoes);
  return db;
}

// `ate`: aplica só as migrações com nome <= ate (usado nos testes de migração).
export function migrate(db, { ate } = {}) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (nome TEXT PRIMARY KEY, aplicada_em TEXT NOT NULL)');
  const aplicadas = new Set(db.prepare('SELECT nome FROM schema_migrations').all().map((r) => r.nome));
  const arquivos = readdirSync(PASTA_MIGRACOES).filter((f) => f.endsWith('.sql')).sort();
  for (const arquivo of arquivos) {
    if (aplicadas.has(arquivo) || (ate && arquivo > ate)) continue;
    const sql = readFileSync(path.join(PASTA_MIGRACOES, arquivo), 'utf8');
    // Recriar uma tabela que tem filhos com ON DELETE CASCADE exige as chaves desligadas,
    // senão o DROP apaga os filhos. O PRAGMA só vale fora da transação.
    const semChaves = sql.startsWith('-- sem-chaves-estrangeiras');
    const chavesAntes = db.prepare('PRAGMA foreign_keys').get().foreign_keys;
    if (semChaves) db.exec('PRAGMA foreign_keys = OFF;');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      if (semChaves && db.prepare('PRAGMA foreign_key_check').all().length) {
        throw new Error(`Migração ${arquivo} quebrou chaves estrangeiras`);
      }
      db.prepare('INSERT INTO schema_migrations (nome, aplicada_em) VALUES (?, ?)').run(arquivo, new Date().toISOString());
      db.exec('COMMIT');
    } catch (erro) {
      db.exec('ROLLBACK');
      throw erro;
    } finally {
      if (semChaves) db.exec(`PRAGMA foreign_keys = ${chavesAntes ? 'ON' : 'OFF'};`);
    }
  }
}
