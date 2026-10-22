import { Router } from 'express';
import { criarRepo } from '../repos/crud.js';
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

  // Quadro geral: tarefas de todos os projetos (menos os perdidos), juntas por projeto.
  r.get('/tarefas', (req, res) => {
    const filtro = req.query.projeto_id ? lerId(req.query.projeto_id) : null;
    const linhas = db
      .prepare(
        `SELECT t.*, p.titulo AS projeto_titulo
         FROM tarefas t JOIN projetos p ON p.id = t.projeto_id
         WHERE p.etapa <> 'perdido'${filtro ? ' AND p.id = ?' : ''}
         ORDER BY p.titulo COLLATE NOCASE, p.id, t.ordem, t.id`,
      )
      .all(...(filtro ? [filtro] : []))
      .map((l) => ({ ...l }));
    res.json(linhas);
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
    if (dados.etapa && dados.etapa !== atual.etapa) dados.ordem = proximaOrdem(db, 'tarefas', 'projeto_id', atual.projeto_id);
    res.json(tarefas.atualizar(atual.id, dados));
  });

  // Sobe ou desce a tarefa uma posição dentro da sua coluna (só entre tarefas do mesmo projeto).
  r.put('/tarefas/:id/posicao', (req, res) => {
    const atual = tarefas.obter(lerId(req.params.id));
    if (!atual) throw naoEncontrado('Tarefa');
    const { direcao } = validar(req.body, REGRAS_POSICAO);
    const todas = listar(atual.projeto_id);
    const daColuna = todas.filter((t) => t.etapa === atual.etapa);
    const vizinha = daColuna[daColuna.findIndex((t) => t.id === atual.id) + (direcao === 'cima' ? -1 : 1)];
    if (vizinha) {
      const ids = todas.map((t) => t.id);
      const [i, j] = [ids.indexOf(atual.id), ids.indexOf(vizinha.id)];
      [ids[i], ids[j]] = [ids[j], ids[i]];
      reordenar(db, 'tarefas', 'projeto_id', atual.projeto_id, ids);
    }
    res.json(tarefas.obter(atual.id));
  });

  r.delete('/tarefas/:id', (req, res) => {
    if (!tarefas.remover(lerId(req.params.id))) throw naoEncontrado('Tarefa');
    res.status(204).end();
  });

  return r;
}
