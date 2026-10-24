import { criarRepo, linha } from './crud.js';
import { somarDias } from '../domain/datas.js';

export const TIPOS_TAREFA = ['site_sistema', 'google_meu_negocio', 'placas_nfc', 'conteudo', 'cobranca', 'comercial', 'interno'];
export const PRIORIDADES_TAREFA = ['urgente', 'alta', 'normal', 'baixa'];
export const CAMPOS_TAREFA = [
  'projeto_id', 'cliente_id', 'texto', 'descricao', 'tipo', 'prioridade', 'prazo', 'concluida', 'etapa', 'ordem',
  'etapa_desde', 'concluida_em', 'parcela_id', 'placa_venda_id',
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

  // Grava uma tarefa nova já com as datas de etapa e no fim da sua lista. dados já validados e coerentes.
  function inserir(dados, dia) {
    const etapa = dados.etapa ?? 'a_fazer';
    return base.criar({
      ...dados,
      tipo: dados.tipo ?? 'interno',
      etapa,
      concluida: etapa === 'concluido' ? 1 : 0,
      etapa_desde: dia,
      concluida_em: etapa === 'concluido' ? dia : null,
      ordem: fimDaLista(dados.projeto_id ?? null),
    });
  }

  return { ...base, checklist, listarCompleto, obterCompleta, comentar, fimDaLista, inserir };
}

const normalizar = (texto) => texto.trim().toLowerCase().replace(/\s+/g, ' ');
const diaMes = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export function repoModelosTarefas(db) {
  const modelos = criarRepo(db, 'tarefas_modelos', ['nome', 'tipo']);
  const itens = criarRepo(db, 'tarefas_modelos_itens', ['modelo_id', 'texto', 'descricao', 'dias_apos_inicio', 'ordem']);
  const comItens = (m) => m && { ...m, itens: itens.listar({ modelo_id: m.id }, 'ordem, id') };
  return {
    modelos,
    itens,
    listar: () => modelos.listar({}, 'nome COLLATE NOCASE, id').map(comItens),
    obter: (id) => comItens(modelos.obter(id)),
    // O primeiro modelo do tipo (por nome) é o padrão daquele serviço.
    padraoDoTipo: (tipo) => comItens(linha(db.prepare('SELECT * FROM tarefas_modelos WHERE tipo = ? ORDER BY nome COLLATE NOCASE, id LIMIT 1').get(tipo))),
  };
}

// O que o modelo criaria no projeto: prazo a partir do início do projeto (ou de hoje) e se já existe
// uma tarefa com o mesmo título (ignorando maiúsculas e espaços), que então não é criada de novo.
export function planejarModelo(db, modelo, projeto, dia) {
  const existentes = new Set(db.prepare('SELECT texto FROM tarefas WHERE projeto_id = ?').all(projeto.id).map((t) => normalizar(t.texto)));
  const inicio = projeto.data_inicio && projeto.data_inicio > dia ? projeto.data_inicio : dia;
  return modelo.itens.map((item) => ({
    texto: item.texto,
    descricao: item.descricao,
    prazo: item.dias_apos_inicio == null ? null : somarDias(inicio, item.dias_apos_inicio),
    ja_existe: existentes.has(normalizar(item.texto)),
  }));
}

// Sem transação própria: quem chama envolve em emTransacao quando faz parte de algo maior.
export function aplicarModelo(db, modelo, projeto, dia) {
  const tarefas = repoTarefas(db);
  const plano = planejarModelo(db, modelo, projeto, dia);
  const novos = plano.filter((p) => !p.ja_existe);
  for (const p of novos) {
    tarefas.inserir({
      projeto_id: projeto.id, cliente_id: projeto.cliente_id, texto: p.texto, descricao: p.descricao, prazo: p.prazo, tipo: modelo.tipo,
    }, dia);
  }
  return { criadas: novos.length, ignoradas: plano.length - novos.length };
}

// Recebimento registrado: as tarefas abertas ligadas àquele dinheiro vão para Concluído, com um comentário.
// ligacao: { parcela_id } ou { placa_venda_id }.
export function concluirPorRecebimento(db, ligacao, dia) {
  const [[coluna, id]] = Object.entries(ligacao);
  const tarefas = repoTarefas(db);
  const abertas = db.prepare(`SELECT * FROM tarefas WHERE ${coluna} = ? AND etapa <> 'concluido'`).all(id).map(linha);
  for (const t of abertas) {
    tarefas.atualizar(t.id, {
      etapa: 'concluido', concluida: 1, etapa_desde: dia, concluida_em: dia, ordem: tarefas.fimDaLista(t.projeto_id),
    });
    tarefas.comentar(t.id, `Concluída ao registrar o recebimento em ${diaMes(dia)}.`);
  }
  return abertas.length;
}

// Recebimento desfeito: a tarefa não reabre sozinha (pode já ter sido resolvida de outro jeito),
// só ganha um comentário para o Lucca decidir.
export function avisarRecebimentoDesfeito(db, ligacao, dia) {
  const [[coluna, id]] = Object.entries(ligacao);
  const tarefas = repoTarefas(db);
  for (const t of db.prepare(`SELECT id FROM tarefas WHERE ${coluna} = ?`).all(id)) {
    tarefas.comentar(t.id, `Recebimento desfeito em ${diaMes(dia)}. A tarefa não foi reaberta: reabra se ainda precisar cobrar.`);
  }
}
