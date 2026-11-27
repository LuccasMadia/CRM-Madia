import { criarRepo, linha } from './crud.js';

const CAMPOS = ['titulo', 'inicio', 'fim', 'dia_inteiro', 'local', 'notas', 'cliente_id', 'projeto_id', 'uid', 'href', 'etag', 'calendario_href', 'origem', 'recorrente', 'pendente', 'apagado'];

export function repoEventos(db) {
  const base = criarRepo(db, 'eventos', CAMPOS);

  return {
    obter: base.obter,
    criar: base.criar,
    atualizar: base.atualizar,
    apagarDefinitivo: base.remover,
    // Eventos que tocam a janela [de, ate] (datas AAAA-MM-DD), sem os já apagados.
    listar({ de, ate } = {}) {
      const filtros = ['apagado = 0'];
      const valores = [];
      if (ate) { filtros.push('substr(inicio, 1, 10) <= ?'); valores.push(ate); }
      if (de) { filtros.push('substr(coalesce(fim, inicio), 1, 10) >= ?'); valores.push(de); }
      return db.prepare(`SELECT * FROM eventos WHERE ${filtros.join(' AND ')} ORDER BY inicio, id`).all(...valores).map(linha);
    },
    porUid: (uid) => linha(db.prepare('SELECT * FROM eventos WHERE uid = ?').get(uid)),
    marcarApagado: (id) => base.atualizar(id, { apagado: 1 }),
  };
}
