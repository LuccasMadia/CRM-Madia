import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from './connection.js';

const t = '2026-10-01T00:00:00.000Z';

describe('migration 047_eventos_calendario', () => {
  it('os eventos já sincronizados passam a apontar para o calendário único escolhido até então', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    migrate(db, { ate: '046_eventos.sql' });
    db.prepare("INSERT INTO config (chave, valor) VALUES ('apple_calendario_href', 'https://x/trabalho/')").run();
    const evento = db.prepare('INSERT INTO eventos (titulo, inicio, uid, href, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?)');
    evento.run('Sincronizado', '2026-10-05T10:00', 'a', 'https://x/trabalho/a.ics', t, t);
    evento.run('Só local', '2026-10-06T10:00', 'b', null, t, t);

    migrate(db);

    const lista = db.prepare('SELECT titulo, calendario_href FROM eventos ORDER BY id').all().map((l) => ({ ...l }));
    expect(lista).toEqual([{ titulo: 'Sincronizado', calendario_href: 'https://x/trabalho/' }, { titulo: 'Só local', calendario_href: null }]);
  });
});
