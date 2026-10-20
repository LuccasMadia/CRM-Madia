import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from './connection.js';

const t = '2026-10-01T00:00:00.000Z';

describe('migration 024_cliente_proprio', () => {
  it('marca só o cliente "Portfólio" como próprio', () => {
    const db = new DatabaseSync(':memory:');
    migrate(db, { ate: '023_hospedagem_sites.sql' });
    const ins = db.prepare('INSERT INTO clientes (nome, criado_em, atualizado_em) VALUES (?, ?, ?)');
    ins.run('Popy', t, t);
    ins.run('Portfólio', t, t);

    migrate(db);

    expect(db.prepare('SELECT nome, proprio FROM clientes ORDER BY id').all().map((r) => ({ ...r })))
      .toEqual([{ nome: 'Popy', proprio: 0 }, { nome: 'Portfólio', proprio: 1 }]);
  });
});
