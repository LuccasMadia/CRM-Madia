const agora = () => new Date().toISOString();

// node:sqlite devolve objetos sem protótipo; convertemos para objetos comuns.
export const linha = (registro) => (registro ? { ...registro } : null);

export function criarRepo(db, tabela, campos) {
  const escolher = (dados) => Object.fromEntries(campos.filter((c) => c in dados).map((c) => [c, dados[c]]));

  function obter(id) {
    return linha(db.prepare(`SELECT * FROM ${tabela} WHERE id = ?`).get(id));
  }

  function listar(filtro = {}, ordem = 'id') {
    const chaves = Object.keys(filtro);
    const where = chaves.length ? ` WHERE ${chaves.map((c) => `${c} = ?`).join(' AND ')}` : '';
    return db
      .prepare(`SELECT * FROM ${tabela}${where} ORDER BY ${ordem}`)
      .all(...chaves.map((c) => filtro[c]))
      .map(linha);
  }

  function criar(dados) {
    const valores = { ...escolher(dados), criado_em: agora(), atualizado_em: agora() };
    const colunas = Object.keys(valores);
    const { lastInsertRowid } = db
      .prepare(`INSERT INTO ${tabela} (${colunas.join(', ')}) VALUES (${colunas.map(() => '?').join(', ')})`)
      .run(...colunas.map((c) => valores[c]));
    return obter(Number(lastInsertRowid));
  }

  function atualizar(id, dados) {
    const valores = { ...escolher(dados), atualizado_em: agora() };
    const colunas = Object.keys(valores);
    const { changes } = db
      .prepare(`UPDATE ${tabela} SET ${colunas.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`)
      .run(...colunas.map((c) => valores[c]), id);
    return changes ? obter(id) : null;
  }

  function remover(id) {
    return db.prepare(`DELETE FROM ${tabela} WHERE id = ?`).run(id).changes > 0;
  }

  return { obter, listar, criar, atualizar, remover };
}

export function emTransacao(db, fn) {
  db.exec('BEGIN');
  try {
    const resultado = fn();
    db.exec('COMMIT');
    return resultado;
  } catch (erro) {
    db.exec('ROLLBACK');
    throw erro;
  }
}
