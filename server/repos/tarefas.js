import { criarRepo, linha } from './crud.js';

export const TIPOS_TAREFA = ['site_sistema', 'google_meu_negocio', 'placas_nfc', 'conteudo', 'cobranca', 'comercial', 'interno'];
export const PRIORIDADES_TAREFA = ['urgente', 'alta', 'normal', 'baixa'];
export const CAMPOS_TAREFA = [
  'projeto_id', 'cliente_id', 'texto', 'descricao', 'tipo', 'prioridade', 'prazo', 'concluida', 'etapa', 'ordem',
  'etapa_desde', 'concluida_em',
];

// A tarefa como as telas mostram: empresa, projeto, contagem do checklist e dos comentários.
const SELECT_TAREFA = `
  SELECT t.*, p.titulo AS projeto_titulo, p.servico AS projeto_servico, c.nome AS cliente_nome,
    (SELECT COUNT(*) FROM tarefas_checklist k WHERE k.tarefa_id = t.id) AS checklist_total,
    (SELECT COUNT(*) FROM tarefas_checklist k WHERE k.tarefa_id = t.id AND k.feito = 1) AS checklist_feitos,
    (SELECT COUNT(*) FROM tarefas_comentarios m WHERE m.tarefa_id = t.id) AS comentarios_total,
    (COALESCE(TRIM(t.descricao), '') <> '') AS tem_descricao
  FROM tarefas t LEFT JOIN projetos p ON p.id = t.projeto_id LEFT JOIN clientes c ON c.id = t.cliente_id`;
const ORDEM = 'ORDER BY t.projeto_id IS NULL, p.titulo COLLATE NOCASE, p.id, t.ordem, t.id';

export function repoTarefas(db) {
  const base = criarRepo(db, 'tarefas', CAMPOS_TAREFA);
  const checklist = criarRepo(db, 'tarefas_checklist', ['tarefa_id', 'texto', 'feito', 'ordem']);

  // filtros: [condição SQL, ...valores]; sem filtro de projeto, os perdidos ficam de fora.
  function listarCompleto(condicoes = []) {
    const where = condicoes.length ? `WHERE ${condicoes.map(([sql]) => `(${sql})`).join(' AND ')}` : '';
    return db.prepare(`${SELECT_TAREFA} ${where} ${ORDEM}`).all(...condicoes.flatMap(([, ...v]) => v)).map(linha);
  }

  function obterCompleta(id) {
    const tarefa = linha(db.prepare(`${SELECT_TAREFA} WHERE t.id = ?`).get(id));
    if (!tarefa) return null;
    return {
      ...tarefa,
      checklist: checklist.listar({ tarefa_id: id }, 'ordem, id'),
      comentarios: db.prepare('SELECT * FROM tarefas_comentarios WHERE tarefa_id = ? ORDER BY criado_em, id').all(id).map(linha),
    };
  }

  // A linha do tempo só cresce: comentário não tem atualizado_em.
  function comentar(tarefaId, texto) {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO tarefas_comentarios (tarefa_id, texto, criado_em) VALUES (?, ?, ?)')
      .run(tarefaId, texto, new Date().toISOString());
    return linha(db.prepare('SELECT * FROM tarefas_comentarios WHERE id = ?').get(Number(lastInsertRowid)));
  }

  // "IS ?" também casa com NULL: as tarefas sem projeto formam uma lista só delas.
  const fimDaLista = (projetoId) =>
    db.prepare('SELECT COALESCE(MAX(ordem) + 1, 0) AS n FROM tarefas WHERE projeto_id IS ?').get(projetoId ?? null).n;

  return { ...base, checklist, listarCompleto, obterCompleta, comentar, fimDaLista };
}
