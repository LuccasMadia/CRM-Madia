import { Router } from 'express';
import { emTransacao, linha } from '../repos/crud.js';
import { repoProjetos } from '../repos/projetos.js';
import { repoClientes } from '../repos/clientes.js';
import { repoTarefas, repoModelosTarefas, planejarModelo, aplicarModelo, TIPOS_TAREFA, PRIORIDADES_TAREFA } from '../repos/tarefas.js';
import { reordenar, proximaOrdem } from '../repos/ordem.js';
import { valorVendaPlaca } from '../domain/placas.js';
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
  parcela_id: { tipo: 'inteiro', min: 1 },
  placa_venda_id: { tipo: 'inteiro', min: 1 },
};
const REGRAS_MODELO = { nome: { tipo: 'texto', obrigatorio: true }, tipo: { tipo: 'enum', valores: TIPOS_TAREFA, obrigatorio: true } };
const REGRAS_ITEM_MODELO = {
  texto: { tipo: 'texto', obrigatorio: true },
  descricao: { tipo: 'texto' },
  dias_apos_inicio: { tipo: 'inteiro', min: 0, max: 365 },
};
const REGRAS_APLICAR = { modelo_id: { tipo: 'inteiro', min: 1, obrigatorio: true } };
const REGRAS_LEMBRETE = { parcela_id: { tipo: 'inteiro', min: 1 }, placa_venda_id: { tipo: 'inteiro', min: 1 } };
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

const reais = (centavos) => (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\s/g, ' ');

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
    // Ligada a um dinheiro só: escolher a parcela solta a venda de placa, e vice-versa.
    if (saida.parcela_id) {
      if (!db.prepare('SELECT 1 FROM parcelas WHERE id = ?').get(saida.parcela_id)) throw invalido('parcela_id', 'Parcela não encontrada');
      saida.placa_venda_id = null;
    }
    if (saida.placa_venda_id) {
      if (!db.prepare('SELECT 1 FROM placas_vendas WHERE id = ?').get(saida.placa_venda_id)) throw invalido('placa_venda_id', 'Venda não encontrada');
      saida.parcela_id = null;
    }
    return saida;
  }

  function criar(corpo, projetoFixo = null) {
    const validados = semVazios(alinharEtapa(validar(corpo, REGRAS_TAREFA)));
    const { servicoDoProjeto, ...dados } = ajustarVinculo(projetoFixo ? { ...validados, projeto_id: projetoFixo.id } : validados);
    const criada = tarefas.inserir({ ...dados, tipo: dados.tipo ?? servicoDoProjeto ?? 'interno' }, hoje());
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

  // ---- Cobrança ligada ao dinheiro ----

  const dataBr = (iso) => iso.split('-').reverse().join('/');
  const parcelaComProjeto = (id) => linha(db.prepare(
    `SELECT pa.*, p.titulo AS projeto_titulo, p.cliente_id, c.nome AS cliente_nome FROM parcelas pa
     JOIN projetos p ON p.id = pa.projeto_id JOIN clientes c ON c.id = p.cliente_id WHERE pa.id = ?`,
  ).get(id));
  const vendaComCliente = (id) => linha(db.prepare(
    `SELECT v.*, m.nome AS modelo_nome, c.nome AS cliente_nome FROM placas_vendas v
     JOIN placas_modelos m ON m.id = v.modelo_id LEFT JOIN clientes c ON c.id = v.cliente_id WHERE v.id = ?`,
  ).get(id));
  const rotuloParcela = (pa) => `${pa.projeto_titulo} · ${pa.descricao || 'Parcela'} · ${reais(pa.valor_centavos)} · vence ${dataBr(pa.vencimento)}`;
  const rotuloVenda = (v) => `${v.modelo_nome} × ${v.quantidade} · ${reais(valorVendaPlaca(v))} · vendida em ${dataBr(v.data_venda)}`;

  // O que a tarefa pode cobrar: parcelas abertas e vendas de placa a receber da empresa dela
  // (e a ligação atual, mesmo já paga, para o seletor mostrar o que está escolhido).
  r.get('/tarefas/:id/cobrancas', (req, res) => {
    const t = exigirTarefa(req.params.id);
    const parcelas = t.cliente_id ? db.prepare(
      `SELECT pa.id FROM parcelas pa JOIN projetos p ON p.id = pa.projeto_id
       WHERE p.cliente_id = ? AND p.ficticio = 0 AND (pa.pago_em IS NULL OR pa.id IS ?) ORDER BY pa.vencimento, pa.id`,
    ).all(t.cliente_id, t.parcela_id).map((l) => parcelaComProjeto(l.id)) : [];
    const vendas = t.cliente_id ? db.prepare(
      `SELECT v.id FROM placas_vendas v WHERE v.cliente_id = ? AND (v.recebido_em IS NULL OR v.id IS ?)
         AND v.id NOT IN (SELECT venda_id FROM projetos_servicos WHERE venda_id IS NOT NULL) ORDER BY v.data_venda, v.id`,
    ).all(t.cliente_id, t.placa_venda_id).map((l) => vendaComCliente(l.id)) : [];
    res.json([
      ...parcelas.map((pa) => ({ tipo: 'parcela', id: pa.id, rotulo: rotuloParcela(pa), pago: Boolean(pa.pago_em) })),
      ...vendas.map((v) => ({ tipo: 'placa_venda', id: v.id, rotulo: rotuloVenda(v), pago: Boolean(v.recebido_em) })),
    ]);
  });

  // "Criar lembrete de cobrança" a partir de uma parcela ou venda a receber: tarefa de cobrança
  // já ligada, na empresa certa. Se já existe um lembrete aberto para aquele dinheiro, devolve ele.
  r.post('/tarefas/lembrete-cobranca', (req, res) => {
    const { parcela_id, placa_venda_id } = validar(req.body, REGRAS_LEMBRETE);
    if (Boolean(parcela_id) === Boolean(placa_venda_id)) throw new ErroHttp(400, 'Informe a parcela ou a venda de placa.');
    const [coluna, id] = parcela_id ? ['parcela_id', parcela_id] : ['placa_venda_id', placa_venda_id];
    const existente = db.prepare(`SELECT id FROM tarefas WHERE ${coluna} = ? AND etapa <> 'concluido' ORDER BY id LIMIT 1`).get(id);
    if (existente) return res.json({ ...tarefas.obterCompleta(existente.id), ja_existia: true });

    let dados;
    if (parcela_id) {
      const pa = parcelaComProjeto(parcela_id);
      if (!pa) throw naoEncontrado('Parcela');
      if (pa.pago_em) throw new ErroHttp(400, 'Esta parcela já foi paga.');
      dados = {
        texto: `Cobrar ${pa.cliente_nome} — ${reais(pa.valor_centavos)}`, projeto_id: pa.projeto_id, cliente_id: pa.cliente_id,
        prazo: pa.vencimento, parcela_id: pa.id, descricao: rotuloParcela(pa),
      };
    } else {
      const v = vendaComCliente(placa_venda_id);
      if (!v) throw naoEncontrado('Venda');
      if (v.recebido_em) throw new ErroHttp(400, 'Esta venda já foi recebida.');
      dados = {
        texto: `Cobrar ${v.cliente_nome ?? v.comprador_nome} — ${reais(valorVendaPlaca(v))}`, cliente_id: v.cliente_id,
        placa_venda_id: v.id, descricao: rotuloVenda(v),
      };
    }
    const criada = tarefas.inserir({ ...dados, tipo: 'cobranca' }, hoje());
    res.status(201).json(tarefas.obterCompleta(criada.id));
  });

  // ---- Modelos de tarefas ----

  const modelos = repoModelosTarefas(db);
  function exigirModelo(id) {
    const modelo = modelos.obter(lerId(id));
    if (!modelo) throw naoEncontrado('Modelo');
    return modelo;
  }
  function exigirItemModelo(id) {
    const item = modelos.itens.obter(lerId(id));
    if (!item) throw naoEncontrado('Item');
    return item;
  }

  r.get('/tarefas-modelos', (req, res) => res.json(modelos.listar()));

  r.post('/tarefas-modelos', (req, res) => {
    const criado = modelos.modelos.criar(validar(req.body, REGRAS_MODELO));
    res.status(201).json(modelos.obter(criado.id));
  });

  r.put('/tarefas-modelos/:id', (req, res) => {
    const modelo = exigirModelo(req.params.id);
    modelos.modelos.atualizar(modelo.id, validar(req.body, REGRAS_MODELO, { parcial: true }));
    res.json(modelos.obter(modelo.id));
  });

  r.delete('/tarefas-modelos/:id', (req, res) => {
    modelos.modelos.remover(exigirModelo(req.params.id).id);
    res.status(204).end();
  });

  r.post('/tarefas-modelos/:id/itens', (req, res) => {
    const modelo = exigirModelo(req.params.id);
    const ordem = proximaOrdem(db, 'tarefas_modelos_itens', 'modelo_id', modelo.id);
    modelos.itens.criar({ ...validar(req.body, REGRAS_ITEM_MODELO), modelo_id: modelo.id, ordem });
    res.status(201).json(modelos.obter(modelo.id));
  });

  r.put('/tarefas-modelos/:id/itens/ordem', (req, res) => {
    const modelo = exigirModelo(req.params.id);
    reordenar(db, 'tarefas_modelos_itens', 'modelo_id', modelo.id, req.body?.ids);
    res.json(modelos.obter(modelo.id));
  });

  r.put('/tarefas-modelos/itens/:id', (req, res) => {
    const item = exigirItemModelo(req.params.id);
    modelos.itens.atualizar(item.id, validar(req.body, REGRAS_ITEM_MODELO, { parcial: true }));
    res.json(modelos.obter(item.modelo_id));
  });

  r.delete('/tarefas-modelos/itens/:id', (req, res) => {
    const item = exigirItemModelo(req.params.id);
    modelos.itens.remover(item.id);
    res.json(modelos.obter(item.modelo_id));
  });

  // Prévia do modelo no projeto: o que seria criado e o que já existe (e não se repete).
  r.get('/projetos/:id/aplicar-modelo', (req, res) => {
    const projeto = exigirProjeto(req);
    const modelo = exigirModelo(req.query.modelo_id);
    res.json({ modelo_id: modelo.id, itens: planejarModelo(db, modelo, projeto, hoje()) });
  });

  r.post('/projetos/:id/aplicar-modelo', (req, res) => {
    const projeto = exigirProjeto(req);
    const { modelo_id } = validar(req.body, REGRAS_APLICAR);
    const modelo = exigirModelo(modelo_id);
    res.json(emTransacao(db, () => aplicarModelo(db, modelo, projeto, hoje())));
  });

  return r;
}
