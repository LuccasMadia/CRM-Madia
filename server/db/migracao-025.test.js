import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from './connection.js';

const t = '2026-10-01T00:00:00.000Z';

describe('migration 025_instagram_com_arroba', () => {
  it('põe um @ só na frente do perfil e limpa o que ficou só com @', () => {
    const db = new DatabaseSync(':memory:');
    migrate(db, { ate: '024_cliente_proprio.sql' });
    const ins = db.prepare('INSERT INTO clientes (nome, instagram, criado_em, atualizado_em) VALUES (?, ?, ?, ?)');
    for (const [nome, ig] of [['a', 'madia.consultoria'], ['b', '@popy'], ['c', ' @@rango '], ['d', '@'], ['e', null], ['f', '']]) ins.run(nome, ig, t, t);

    migrate(db);

    expect(db.prepare('SELECT instagram FROM clientes ORDER BY id').all().map((r) => r.instagram))
      .toEqual(['@madia.consultoria', '@popy', '@rango', null, null, null]);
  });
});
