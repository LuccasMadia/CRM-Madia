import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from './connection.js';

const t = '2026-10-01T00:00:00.000Z';

function antes() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  migrate(db, { ate: '020_cliente_pela_empresa.sql' });
  return db;
}

describe('migration 021_publicacao_instagram', () => {
  it('move a arte para conteudo_midias e preserva ids e midia_id', () => {
    const db = antes();
    db.prepare('INSERT INTO instagram_midias (id, tipo, publicado_em, atualizado_em) VALUES (?, ?, ?, ?)').run('m1', 'post', t, t);
    const c = db.prepare('INSERT INTO conteudos (id, tipo, titulo, estado, ordem, arte, midia_id, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    c.run(7, 'post', 'Com arte', 'pronto', 3, 'x.png', 'm1', t, t);
    c.run(8, 'post', 'Sem arte', 'rascunho', 4, null, null, t, t);

    migrate(db);

    expect(db.prepare('SELECT conteudo_id, arquivo, tipo, ordem FROM conteudo_midias').all().map((r) => ({ ...r })))
      .toEqual([{ conteudo_id: 7, arquivo: 'x.png', tipo: 'imagem', ordem: 0 }]);
    const cols = db.prepare('PRAGMA table_info(conteudos)').all().map((r) => r.name);
    expect(cols).not.toContain('arte');
    expect(cols).toEqual(expect.arrayContaining(['agendado_para', 'publicacao_erro', 'publicacao_token', 'publicacao_container_id', 'publicacao_enviado_em', 'publicacao_midia_id']));
    expect(db.prepare('SELECT id, estado, ordem, midia_id FROM conteudos ORDER BY id').all().map((r) => ({ ...r })))
      .toEqual([{ id: 7, estado: 'pronto', ordem: 3, midia_id: 'm1' }, { id: 8, estado: 'rascunho', ordem: 4, midia_id: null }]);
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it('aceita os estados de publicação, recusa outros, e apagar o conteúdo apaga as mídias', () => {
    const db = antes();
    migrate(db);
    const ins = db.prepare('INSERT INTO conteudos (tipo, titulo, estado, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?)');
    for (const e of ['agendado', 'publicando', 'publicado', 'falhou', 'atrasado']) ins.run('post', e, e, t, t);
    expect(() => ins.run('post', 'x', 'inventado', t, t)).toThrow();
    db.prepare("INSERT INTO conteudo_midias (conteudo_id, arquivo, tipo, ordem) VALUES (1, 'a.png', 'imagem', 0)").run();
    expect(() => db.prepare("INSERT INTO conteudo_midias (conteudo_id, arquivo, tipo, ordem) VALUES (1, 'a.gif', 'gif', 1)").run()).toThrow();
    db.prepare('DELETE FROM conteudos WHERE id = 1').run();
    expect(db.prepare('SELECT COUNT(*) AS n FROM conteudo_midias').get().n).toBe(0);
  });
});
