import { ErroValidacao } from '../http/erros.js';
import { emTransacao } from './crud.js';

export function reordenar(db, tabela, campoPai, idPai, ids) {
  const atuais = db.prepare(`SELECT id FROM ${tabela} WHERE ${campoPai} = ?`).all(idPai).map((r) => r.id);
  const valido =
    Array.isArray(ids) &&
    ids.length === atuais.length &&
    new Set(ids).size === ids.length &&
    ids.every((id) => atuais.includes(id));
  if (!valido) throw new ErroValidacao([{ campo: 'ids', mensagem: 'A lista deve conter exatamente os itens atuais' }]);
  const atualizar = db.prepare(`UPDATE ${tabela} SET ordem = ? WHERE id = ?`);
  emTransacao(db, () => ids.forEach((id, indice) => atualizar.run(indice, id)));
}

export function proximaOrdem(db, tabela, campoPai, idPai) {
  return db.prepare(`SELECT COALESCE(MAX(ordem) + 1, 0) AS n FROM ${tabela} WHERE ${campoPai} = ?`).get(idPai).n;
}
