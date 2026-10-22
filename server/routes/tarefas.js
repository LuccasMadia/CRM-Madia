import { Router } from 'express';
import { criarRepo, emTransacao } from '../repos/crud.js';
import { repoProjetos } from '../repos/projetos.js';
import { reordenar, proximaOrdem } from '../repos/ordem.js';
import { validar, lerId } from '../http/validar.js';
import { naoEncontrado } from '../http/erros.js';

export const ETAPAS_TAREFA = ['a_fazer', 'fazendo', 'aguardando_cliente', 'concluido'];

const REGRAS_TAREFA = {
  texto: { tipo: 'texto', obrigatorio: true },
  prazo: { tipo: 'data' },
  concluida: { tipo: 'bool' },
  etapa: { tipo: 'enum', valores: ETAPAS_TAREFA },
};
const REGRAS_POSICAO = { direcao: { tipo: 'enum', valores: ['cima', 'baixo'], obrigatorio: true } };

// "concluida" acompanha a etapa: quem manda só um dos dois recebe o outro ajustado.
function alinharEtapa(dados, atual) {
  if ('etapa' in dados) return { ...dados, concluida: dados.etapa === 'concluido' ? 1 : 0 };
  if ('concluida' in dados) {
    const etapa = dados.concluida ? 'concluido' : atual?.etapa === 'concluido' || !atual ? 'a_fazer' : atual.etapa;
    return { ...dados, etapa };
  }
  return dados;
}

export function rotasTarefas({ db }) {
  const tarefas = criarRepo(db, 'tarefas', ['projeto_id', 'texto', 'prazo', 'concluida', 'etapa', 'ordem']);
  const projetos = repoProjetos(db);
  const r = Router();

  function exigirProjeto(req) {
    const projeto = projetos.obter(lerId(req.params.id));
    if (!projeto) throw naoEncontrado('Projeto');
    return projeto;
  }
  const listar = (projetoId) => tarefas.listar({ projeto_id: projetoId }, 'ordem, id');
  // "IS ?" também casa com NULL: as tarefas internas (sem projeto) formam uma lista só delas.
  const daMesmaLista = (projetoId) =>
    db.prepare('SELECT * FROM tarefas WHERE projeto_id IS ? ORDER BY ordem, id').all(projetoId).map((l) => ({ ...l }));
  const fimDaLista = (projetoId) =>
    db.prepare('SELECT COALESCE(MAX(ordem) + 1, 0) AS n FROM tarefas WHERE projeto_id IS ?').get(projetoId).n;

  // Quadro geral: tarefas de todos os projetos (menos os perdidos), juntas por projeto, com a empresa.
  // As internas (sem projeto) vêm no fim; ?sem_projeto=1 mostra só elas.
  r.get('/tarefas', (req, res) => {
    const filtro = req.query.projeto_id ? lerId(req.query.projeto_id) : null;
    const condicao = filtro ? 'p.id = ?' : req.query.sem_projeto === '1' ? 't.projeto_id IS NULL' : "(p.id IS NULL OR p.etapa <> 'perdido')";
    const linhas = db
      .prepare(
        `SELECT t.*, p.titulo AS projeto_titulo, p.cliente_id, c.nome AS cliente_nome
         FROM tarefas t LEFT JOIN projetos p ON p.id = t.projeto_id LEFT JOIN clientes c ON c.id = p.cliente_id
         WHERE ${condicao}
         ORDER BY t.projeto_id IS NULL, p.titulo COLLATE NOCASE, p.id, t.ordem, t.id`,
      )
      .all(...(filtro ? [filtro] : []))
      .map((l) => ({ ...l }));
    res.json(linhas);
  });

  r.post('/tarefas', (req, res) => {
    const dados = alinharEtapa(validar(req.body, REGRAS_TAREFA));
    res.status(201).json(tarefas.criar({ ...dados, projeto_id: null, ordem: fimDaLista(null) }));
  });

  r.get('/projetos/:id/tarefas', (req, res) => res.json(listar(exigirProjeto(req).id)));

  r.post('/projetos/:id/tarefas', (req, res) => {
    const projeto = exigirProjeto(req);
    const dados = alinharEtapa(validar(req.body, REGRAS_TAREFA));
    const criada = tarefas.criar({ ...dados, projeto_id: projeto.id, ordem: proximaOrdem(db, 'tarefas', 'projeto_id', projeto.id) });
    res.status(201).json(criada);
  });

  r.put('/projetos/:id/tarefas/ordem', (req, res) => {
    const projeto = exigirProjeto(req);
    reordenar(db, 'tarefas', 'projeto_id', projeto.id, req.body?.ids);
    res.json(listar(projeto.id));
  });

  r.put('/tarefas/:id', (req, res) => {
    const atual = tarefas.obter(lerId(req.params.id));
    if (!atual) throw naoEncontrado('Tarefa');
    const dados = alinharEtapa(validar(req.body, REGRAS_TAREFA, { parcial: true }), atual);
    // Mudou de coluna: entra no fim da coluna nova.
    if (dados.etapa && dados.etapa !== atual.etapa) dados.ordem = fimDaLista(atual.projeto_id);
    res.json(tarefas.atualizar(atual.id, dados));
  });

  // Sobe ou desce a tarefa uma posição dentro da sua coluna (só entre tarefas do mesmo projeto, ou entre as internas).
  r.put('/tarefas/:id/posicao', (req, res) => {
    const atual = tarefas.obter(lerId(req.params.id));
    if (!atual) throw naoEncontrado('Tarefa');
    const { direcao } = validar(req.body, REGRAS_POSICAO);
    const todas = daMesmaLista(atual.projeto_id);
    const daColuna = todas.filter((t) => t.etapa === atual.etapa);
    const vizinha = daColuna[daColuna.findIndex((t) => t.id === atual.id) + (direcao === 'cima' ? -1 : 1)];
    if (vizinha) {
      const ids = todas.map((t) => t.id);
      const [i, j] = [ids.indexOf(atual.id), ids.indexOf(vizinha.id)];
      [ids[i], ids[j]] = [ids[j], ids[i]];
      const atualizar = db.prepare('UPDATE tarefas SET ordem = ? WHERE id = ?');
      emTransacao(db, () => ids.forEach((id, indice) => atualizar.run(indice, id)));
    }
    res.json(tarefas.obter(atual.id));
  });

  r.delete('/tarefas/:id', (req, res) => {
    if (!tarefas.remover(lerId(req.params.id))) throw naoEncontrado('Tarefa');
    res.status(204).end();
  });

  return r;
}
