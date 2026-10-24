import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from './connection.js';

const t = '2026-10-14T13:00:00.000Z';

function bancoAte030() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db, { ate: '030_orcamento_gerou.sql' });
  db.prepare('INSERT INTO clientes (id, nome, criado_em, atualizado_em) VALUES (1, ?, ?, ?), (2, ?, ?, ?)').run('Filinto', t, t, 'House', t, t);
  db.prepare("INSERT INTO projetos (id, cliente_id, titulo, servico, criado_em, atualizado_em) VALUES (1, 1, 'Cardápio', 'site_sistema', ?, ?)").run(t, t);
  db.prepare("INSERT INTO projetos (id, cliente_id, titulo, servico, etapa, criado_em, atualizado_em) VALUES (2, 1, 'GMN', 'google_meu_negocio', 'andamento', ?, ?)").run(t, t);
  const tarefa = db.prepare('INSERT INTO tarefas (id, projeto_id, texto, etapa, concluida, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?)');
  tarefa.run(1, 1, 'Cobrar placa 10x10 NFC', 'a_fazer', 0, t, t);
  tarefa.run(2, 2, 'Pedir fotos', 'concluido', 1, t, '2026-10-20T09:00:00.000Z');
  tarefa.run(3, null, 'Receber placa NFC house 80,00', 'aguardando_cliente', 0, t, '2026-10-18T22:00:00.000Z');
  return db;
}

describe('migration 031_tarefas_completas', () => {
  it('migra empresa e tipo pelo projeto; sem projeto vira interna, sem adivinhar o cliente pelo texto', () => {
    const db = bancoAte030();
    migrate(db);
    const linhas = db.prepare('SELECT id, cliente_id, tipo, prioridade, descricao, etapa_desde, concluida_em FROM tarefas ORDER BY id').all().map((l) => ({ ...l }));
    expect(linhas).toEqual([
      { id: 1, cliente_id: 1, tipo: 'site_sistema', prioridade: 'normal', descricao: null, etapa_desde: '2026-10-14', concluida_em: null },
      { id: 2, cliente_id: 1, tipo: 'google_meu_negocio', prioridade: 'normal', descricao: null, etapa_desde: '2026-10-20', concluida_em: '2026-10-20' },
      // "house" no texto não liga a tarefa à House: isso fica para o Lucca
      { id: 3, cliente_id: null, tipo: 'interno', prioridade: 'normal', descricao: null, etapa_desde: '2026-10-18', concluida_em: null },
    ]);
    expect(() => db.prepare("UPDATE tarefas SET tipo = 'outro' WHERE id = 1").run()).toThrow();
    expect(() => db.prepare("UPDATE tarefas SET prioridade = 'maxima' WHERE id = 1").run()).toThrow();
  });

  it('projeto que troca de cliente leva as tarefas; cliente apagado só solta a tarefa', () => {
    const db = bancoAte030();
    migrate(db);
    db.prepare('UPDATE projetos SET cliente_id = 2 WHERE id = 1').run();
    expect(db.prepare('SELECT cliente_id FROM tarefas WHERE id = 1').get().cliente_id).toBe(2);
    expect(db.prepare('SELECT cliente_id FROM tarefas WHERE id = 2').get().cliente_id).toBe(1);

    db.prepare('UPDATE tarefas SET cliente_id = 2 WHERE id = 3').run();
    db.prepare('DELETE FROM projetos WHERE cliente_id = 2').run();
    db.prepare('DELETE FROM clientes WHERE id = 2').run();
    expect({ ...db.prepare('SELECT cliente_id, texto FROM tarefas WHERE id = 3').get() }).toEqual({ cliente_id: null, texto: 'Receber placa NFC house 80,00' });
  });

  it('checklist e comentários somem junto com a tarefa', () => {
    const db = bancoAte030();
    migrate(db);
    db.prepare("INSERT INTO tarefas_checklist (tarefa_id, texto, criado_em, atualizado_em) VALUES (1, 'Item', ?, ?)").run(t, t);
    db.prepare("INSERT INTO tarefas_comentarios (tarefa_id, texto, criado_em) VALUES (1, 'Falei com ele', ?)").run(t);
    db.prepare('DELETE FROM tarefas WHERE id = 1').run();
    expect(db.prepare('SELECT COUNT(*) AS n FROM tarefas_checklist').get().n).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS n FROM tarefas_comentarios').get().n).toBe(0);
  });
});
