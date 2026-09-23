import { Router } from 'express';
import { criarRepo } from '../repos/crud.js';
import { repoProjetos } from '../repos/projetos.js';
import { reordenar, proximaOrdem } from '../repos/ordem.js';
import { validar, lerId } from '../http/validar.js';
import { naoEncontrado } from '../http/erros.js';

const REGRAS_TAREFA = {
  texto: { tipo: 'texto', obrigatorio: true },
  prazo: { tipo: 'data' },
  concluida: { tipo: 'bool' },
};

export function rotasTarefas({ db }) {
  const tarefas = criarRepo(db, 'tarefas', ['projeto_id', 'texto', 'prazo', 'concluida', 'ordem']);
  const projetos = repoProjetos(db);
  const r = Router();

  function exigirProjeto(req) {
    const projeto = projetos.obter(lerId(req.params.id));
    if (!projeto) throw naoEncontrado('Projeto');
    return projeto;
  }
  const listar = (projetoId) => tarefas.listar({ projeto_id: projetoId }, 'ordem, id');

  r.get('/projetos/:id/tarefas', (req, res) => res.json(listar(exigirProjeto(req).id)));

  r.post('/projetos/:id/tarefas', (req, res) => {
    const projeto = exigirProjeto(req);
    const dados = validar(req.body, REGRAS_TAREFA);
    const criada = tarefas.criar({ ...dados, projeto_id: projeto.id, ordem: proximaOrdem(db, 'tarefas', 'projeto_id', projeto.id) });
    res.status(201).json(criada);
  });

  r.put('/projetos/:id/tarefas/ordem', (req, res) => {
    const projeto = exigirProjeto(req);
    reordenar(db, 'tarefas', 'projeto_id', projeto.id, req.body?.ids);
    res.json(listar(projeto.id));
  });

  r.put('/tarefas/:id', (req, res) => {
    const atualizada = tarefas.atualizar(lerId(req.params.id), validar(req.body, REGRAS_TAREFA, { parcial: true }));
    if (!atualizada) throw naoEncontrado('Tarefa');
    res.json(atualizada);
  });

  r.delete('/tarefas/:id', (req, res) => {
    if (!tarefas.remover(lerId(req.params.id))) throw naoEncontrado('Tarefa');
    res.status(204).end();
  });

  return r;
}
