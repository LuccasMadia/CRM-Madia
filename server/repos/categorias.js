import { criarRepo, linha } from './crud.js';

function comNomeUnico(db, tabela) {
  return {
    idComNome(nome) {
      return db.prepare(`SELECT id FROM ${tabela} WHERE nome = ? COLLATE NOCASE`).get(nome)?.id ?? null;
    },
  };
}

export function repoCategorias(db) {
  const base = criarRepo(db, 'categorias', ['nome', 'ordem']);
  return {
    ...base,
    ...comNomeUnico(db, 'categorias'),
    listarOrdenadas() {
      return base.listar({}, 'ordem, nome COLLATE NOCASE');
    },
    proximaOrdem() {
      return db.prepare('SELECT COALESCE(MAX(ordem), 0) + 1 AS n FROM categorias').get().n;
    },
    contarUso(id) {
      return db.prepare('SELECT COUNT(*) AS n FROM projetos_categorias WHERE categoria_id = ?').get(id).n;
    },
  };
}

export function repoNichos(db) {
  const base = criarRepo(db, 'nichos', ['nome']);
  return {
    ...base,
    ...comNomeUnico(db, 'nichos'),
    listarOrdenadas() {
      return base.listar({}, 'nome COLLATE NOCASE');
    },
    contarUso(id) {
      return db.prepare('SELECT COUNT(*) AS n FROM projetos WHERE nicho_id = ?').get(id).n;
    },
  };
}

export function repoProjetosCategorias(db) {
  return {
    listar(projetoId) {
      return db.prepare(`SELECT c.id, c.nome FROM projetos_categorias pc JOIN categorias c ON c.id = pc.categoria_id
        WHERE pc.projeto_id = ? ORDER BY c.ordem, c.nome COLLATE NOCASE`).all(projetoId).map(linha);
    },
    substituir(projetoId, ids) {
      db.prepare('DELETE FROM projetos_categorias WHERE projeto_id = ?').run(projetoId);
      const inserir = db.prepare('INSERT INTO projetos_categorias (projeto_id, categoria_id) VALUES (?, ?)');
      for (const id of ids) inserir.run(projetoId, id);
    },
  };
}
