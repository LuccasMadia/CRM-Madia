import { Router } from 'express';
import { emTransacao } from '../repos/crud.js';
import { repoProjetos } from '../repos/projetos.js';
import { repoClientes } from '../repos/clientes.js';
import { repoTarefas, TIPOS_TAREFA, PRIORIDADES_TAREFA } from '../repos/tarefas.js';
import { reordenar, proximaOrdem } from '../repos/ordem.js';
import { validar, lerId } from '../http/validar.js';
import { ErroHttp, ErroValidacao, naoEncontrado } from '../http/erros.js';

export const ETAPAS_TAREFA = ['a_fazer', 'fazendo', 'aguardando_cliente', 'concluido'];

const REGRAS_TAREFA = {
  texto: { tipo: 'texto', obrigatorio: true },
  descricao: { tipo: 'texto' },
  prazo: { tipo: 'data' },
  concluida: { tipo: 'bool' },
  etapa: { tipo: 'enum', valores: ETAPAS_TAREFA },
  tipo: { tipo: 'enum', valores: TIPOS_TAREFA },
  prioridade: { tipo: 'enum', valores: PRIORIDADES_TAREFA },
  cliente_id: { tipo: 'inteiro', min: 1 },
  projeto_id: { tipo: 'inteiro', min: 1 },
};
const REGRAS_POSICAO = { direcao: { tipo: 'enum', valores: ['cima', 'baixo'], obrigatorio: true } };
const REGRAS_ITEM = { texto: { tipo: 'texto', obrigatorio: true }, feito: { tipo: 'bool' } };
const REGRAS_COMENTARIO = { texto: { tipo: 'texto', obrigatorio: true } };

const invalido = (campo, mensagem) => new ErroValidacao([{ campo, mensagem }]);

// "concluida" acompanha a etapa: quem manda só um dos dois recebe o outro ajustado.
function alinharEtapa(dados, atual) {
  if ('etapa' in dados) return { ...dados, concluida: dados.etapa === 'concluido' ? 1 : 0 };
  if ('concluida' in dados) {
    const etapa = dados.concluida ? 'concluido' : atual?.etapa === 'concluido' || !atual ? 'a_fazer' : atual.etapa;
    return { ...dados, etapa };
  }
  return dados;
}

// Tipo e prioridade não ficam vazios: "limpar" volta ao padrão.
function semVazios(dados) {
  const saida = { ...dados };
  if (saida.tipo === null) delete saida.tipo;
  if (saida.prioridade === null) saida.prioridade = 'normal';
  return saida;
}

export function rotasTarefas({ db, hoje }) {
  const tarefas = repoTarefas(db);
  const projetos = repoProjetos(db);
  const clientes = repoClientes(db);
  const r = Router();

  function exigirProjeto(req) {
    const projeto = projetos.obter(lerId(req.params.id));
    if (!projeto) throw naoEncontrado('Projeto');
    return projeto;
  }
  function exigirTarefa(id) {
    const tarefa = tarefas.obter(lerId(id));
    if (!tarefa) throw naoEncontrado('Tarefa');
    return tarefa;
  }
  function exigirItem(id) {
    const item = tarefas.checklist.obter(lerId(id));
    if (!item) throw naoEncontrado('Item');
    return item;
  }

  // O projeto manda na empresa: com projeto, cliente_id é o do projeto. Trocar só a empresa
  // tira a tarefa de um projeto que é de outra empresa; mandar os dois desencontrados é erro.
  function ajustarVinculo(dados, atual = null) {
    const saida = { ...dados };
    const projetoId = 'projeto_id' in saida ? saida.projeto_id : atual?.projeto_id ?? null;
    if (projetoId) {
      const projeto = projetos.obter(projetoId);
      if (!projeto) throw invalido('projeto_id', 'Projeto não encontrado');
      if ('cliente_id' in saida && saida.cliente_id !== projeto.cliente_id) {
        if ('projeto_id' in saida) throw invalido('projeto_id', 'Este projeto é de outra empresa');
        saida.projeto_id = null;
      } else {
        saida.cliente_id = projeto.cliente_id;
      }
      saida.servicoDoProjeto = saida.projeto_id === null ? null : projeto.servico;
    }
    if (saida.cliente_id && !clientes.obter(saida.cliente_id)) throw invalido('cliente_id', 'Cliente não encontrado');
    return saida;
  }

  function criar(corpo, projetoFixo = null) {
    const validados = semVazios(alinharEtapa(validar(corpo, REGRAS_TAREFA)));
    const { servicoDoProjeto, ...dados } = ajustarVinculo(projetoFixo ? { ...validados, projeto_id: projetoFixo.id } : validados);
    const dia = hoje();
    const etapa = dados.etapa ?? 'a_fazer';
    const criada = tarefas.criar({
      ...dados,
      tipo: dados.tipo ?? servicoDoProjeto ?? 'interno',
      etapa,
      concluida: etapa === 'concluido' ? 1 : 0,
      etapa_desde: dia,
      concluida_em: etapa === 'concluido' ? dia : null,
      ordem: tarefas.fimDaLista(dados.projeto_id ?? null),
    });
    return tarefas.obterCompleta(criada.id);
  }

  // Quadro geral: tarefas de todos os projetos (menos os perdidos) e as sem projeto, com a empresa.
  // Filtros: projeto_id, sem_projeto=1, cliente_id, tipo, prioridade (todos juntos valem como "e").
  r.get('/tarefas', (req, res) => {
    const q = req.query;
    const condicoes = [];
    if (q.projeto_id) condicoes.push(['p.id = ?', lerId(q.projeto_id)]);
    else condicoes.push(["p.id IS NULL OR p.etapa <> 'perdido'"]);
    if (q.sem_projeto === '1') condicoes.push(['t.projeto_id IS NULL']);
    if (q.cliente_id) condicoes.push(['t.cliente_id = ?', lerId(q.cliente_id)]);
    if (q.tipo) {
      if (!TIPOS_TAREFA.includes(q.tipo)) throw new ErroHttp(400, 'Tipo inválido');
      condicoes.push(['t.tipo = ?', q.tipo]);
    }
    if (q.prioridade) {
      if (!PRIORIDADES_TAREFA.includes(q.prioridade)) throw new ErroHttp(400, 'Prioridade inválida');
      condicoes.push(['t.prioridade = ?', q.prioridade]);
    }
    res.json(tarefas.listarCompleto(condicoes));
  });

  r.post('/tarefas', (req, res) => res.status(201).json(criar(req.body)));

  r.get('/tarefas/:id', (req, res) => res.json(tarefas.obterCompleta(exigirTarefa(req.params.id).id)));

  r.get('/projetos/:id/tarefas', (req, res) => res.json(tarefas.listarCompleto([['p.id = ?', exigirProjeto(req).id]])));

  r.post('/projetos/:id/tarefas', (req, res) => {
    // Dentro do projeto, projeto e empresa vêm do endereço.
    const { projeto_id: _projeto, cliente_id: _cliente, ...corpo } = req.body ?? {};
    res.status(201).json(criar(corpo, exigirProjeto(req)));
  });

  r.put('/projetos/:id/tarefas/ordem', (req, res) => {
    const projeto = exigirProjeto(req);
    reordenar(db, 'tarefas', 'projeto_id', projeto.id, req.body?.ids);
    res.json(tarefas.listarCompleto([['p.id = ?', projeto.id]]));
  });

  r.put('/tarefas/:id', (req, res) => {
    const atual = exigirTarefa(req.params.id);
    const validados = semVazios(alinharEtapa(validar(req.body, REGRAS_TAREFA, { parcial: true }), atual));
    const { servicoDoProjeto: _servico, ...dados } = ajustarVinculo(validados, atual);
    const dia = hoje();
    if (dados.etapa && dados.etapa !== atual.etapa) {
      dados.etapa_desde = dia;
      dados.concluida_em = dados.etapa === 'concluido' ? dia : null;
    }
    // Mudou de coluna ou de projeto: entra no fim da lista nova.
    const novoProjeto = 'projeto_id' in dados && dados.projeto_id !== atual.projeto_id;
    if (novoProjeto || (dados.etapa && dados.etapa !== atual.etapa)) {
      dados.ordem = tarefas.fimDaLista('projeto_id' in dados ? dados.projeto_id : atual.projeto_id);
    }
    tarefas.atualizar(atual.id, dados);
    res.json(tarefas.obterCompleta(atual.id));
  });

  // Sobe ou desce a tarefa uma posição dentro da sua coluna (só entre tarefas do mesmo projeto, ou entre as sem projeto).
  r.put('/tarefas/:id/posicao', (req, res) => {
    const atual = exigirTarefa(req.params.id);
    const { direcao } = validar(req.body, REGRAS_POSICAO);
    const todas = db.prepare('SELECT id, etapa FROM tarefas WHERE projeto_id IS ? ORDER BY ordem, id').all(atual.projeto_id);
    const daColuna = todas.filter((t) => t.etapa === atual.etapa);
    const vizinha = daColuna[daColuna.findIndex((t) => t.id === atual.id) + (direcao === 'cima' ? -1 : 1)];
    if (vizinha) {
      const ids = todas.map((t) => t.id);
      const [i, j] = [ids.indexOf(atual.id), ids.indexOf(vizinha.id)];
      [ids[i], ids[j]] = [ids[j], ids[i]];
      const atualizar = db.prepare('UPDATE tarefas SET ordem = ? WHERE id = ?');
      emTransacao(db, () => ids.forEach((id, indice) => atualizar.run(indice, id)));
    }
    res.json(tarefas.obterCompleta(atual.id));
  });

  r.delete('/tarefas/:id', (req, res) => {
    if (!tarefas.remover(lerId(req.params.id))) throw naoEncontrado('Tarefa');
    res.status(204).end();
  });

  // Checklist: itens na ordem em que foram criados, reordenáveis.
  r.post('/tarefas/:id/checklist', (req, res) => {
    const tarefa = exigirTarefa(req.params.id);
    const { texto } = validar(req.body, REGRAS_ITEM);
    const item = tarefas.checklist.criar({ tarefa_id: tarefa.id, texto, feito: 0, ordem: proximaOrdem(db, 'tarefas_checklist', 'tarefa_id', tarefa.id) });
    res.status(201).json(item);
  });

  r.put('/tarefas/:id/checklist/ordem', (req, res) => {
    const tarefa = exigirTarefa(req.params.id);
    reordenar(db, 'tarefas_checklist', 'tarefa_id', tarefa.id, req.body?.ids);
    res.json(tarefas.checklist.listar({ tarefa_id: tarefa.id }, 'ordem, id'));
  });

  r.put('/tarefas/checklist/:id', (req, res) => {
    const item = exigirItem(req.params.id);
    res.json(tarefas.checklist.atualizar(item.id, validar(req.body, REGRAS_ITEM, { parcial: true })));
  });

  r.delete('/tarefas/checklist/:id', (req, res) => {
    tarefas.checklist.remover(exigirItem(req.params.id).id);
    res.status(204).end();
  });

  // Comentários: linha do tempo da tarefa.
  r.post('/tarefas/:id/comentarios', (req, res) => {
    const tarefa = exigirTarefa(req.params.id);
    const { texto } = validar(req.body, REGRAS_COMENTARIO);
    res.status(201).json(tarefas.comentar(tarefa.id, texto));
  });

  r.delete('/tarefas/comentarios/:id', (req, res) => {
    const { changes } = db.prepare('DELETE FROM tarefas_comentarios WHERE id = ?').run(lerId(req.params.id));
    if (!changes) throw naoEncontrado('Comentário');
    res.status(204).end();
  });

  return r;
}
