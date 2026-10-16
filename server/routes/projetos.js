import { Router } from 'express';
import { repoClientes } from '../repos/clientes.js';
import { repoProjetos } from '../repos/projetos.js';
import { repoProjetosServicos } from '../repos/servicos.js';
import { repoPlacasModelos, repoPlacasModelosItens, repoPlacasLotes, repoPlacasVendas, precoSugeridoPlacas } from '../repos/placas.js';
import { obterConfig } from '../repos/config.js';
import { emTransacao } from '../repos/crud.js';
import { validar, lerId } from '../http/validar.js';
import { ErroHttp, ErroValidacao, naoEncontrado } from '../http/erros.js';
import { ETAPAS, aplicarRegrasProjeto } from '../domain/regras.js';
import { SERVICOS, TIPOS_SERVICO, calcularValorTotal, errosDoServico, valorLinhaServico } from '../domain/servicos.js';
import { calcularCustoUnitarioModelo } from '../domain/placas.js';
import { REGRAS_CLIENTE } from './clientes.js';

const REGRAS_PROJETO = {
  cliente_id: { tipo: 'inteiro', obrigatorio: true },
  titulo: { tipo: 'texto', obrigatorio: true },
  descricao: { tipo: 'texto' },
  etapa: { tipo: 'enum', valores: ETAPAS, padrao: 'contato' },
  valor_total_centavos: { tipo: 'inteiro', min: 0, padrao: 0 },
  desconto_centavos: { tipo: 'inteiro', min: 0, padrao: 0 },
  data_inicio: { tipo: 'data' },
  prazo_entrega: { tipo: 'data' },
  data_entrega: { tipo: 'data' },
  notas: { tipo: 'texto' },
  mensalidade_ativa: { tipo: 'bool', padrao: 0 },
  mensalidade_valor_centavos: { tipo: 'inteiro', min: 0, padrao: 0 },
  mensalidade_dia_vencimento: { tipo: 'inteiro', min: 1, max: 31 },
  postou_instagram: { tipo: 'bool', padrao: 0 },
  ficticio: { tipo: 'bool', padrao: 0 },
  servico: { tipo: 'enum', valores: SERVICOS },
  link_perfil: { tipo: 'texto' },
};

function exigirDadosMensalidade(atual, dados) {
  const ativa = dados.mensalidade_ativa ?? atual?.mensalidade_ativa ?? 0;
  if (!ativa) return;
  const valor = dados.mensalidade_valor_centavos ?? atual?.mensalidade_valor_centavos;
  const dia = dados.mensalidade_dia_vencimento ?? atual?.mensalidade_dia_vencimento;
  const erros = [];
  if (!valor) erros.push({ campo: 'mensalidade_valor_centavos', mensagem: 'Obrigatório quando a mensalidade está ativa' });
  if (!dia) erros.push({ campo: 'mensalidade_dia_vencimento', mensagem: 'Obrigatório quando a mensalidade está ativa' });
  if (erros.length) throw new ErroValidacao(erros);
}

function validarServicos(servicosBrutos, { modelosRepo, db, clienteId = null, projetoId = null }) {
  if (!Array.isArray(servicosBrutos)) throw new ErroValidacao([{ campo: 'servicos', mensagem: 'Deve ser uma lista' }]);
  return servicosBrutos.map((s, i) => {
    if (!TIPOS_SERVICO.includes(s.tipo)) {
      throw new ErroValidacao([{ campo: `servicos[${i}].tipo`, mensagem: 'Tipo de serviço inválido' }]);
    }
    if (s.tipo === 'placas_nfc') {
      const modeloId = Number(s.modelo_id);
      const modelo = Number.isInteger(modeloId) && modeloId > 0 ? modelosRepo.obter(modeloId) : null;
      if (!modelo) throw new ErroValidacao([{ campo: `servicos[${i}].modelo_id`, mensagem: 'Modelo de placa não encontrado' }]);
      const quantidade = Number(s.quantidade);
      if (!Number.isInteger(quantidade) || quantidade < 1) {
        throw new ErroValidacao([{ campo: `servicos[${i}].quantidade`, mensagem: 'Deve ser no mínimo 1' }]);
      }
      let valorTotal;
      if (s.valor_total_centavos != null) valorTotal = s.valor_total_centavos;
      else if (s.valor_unitario_centavos != null) valorTotal = s.valor_unitario_centavos * quantidade;
      else valorTotal = precoSugeridoPlacas(db, { modelo, quantidade, clienteId, projetoId }).total_centavos;
      if (!Number.isInteger(valorTotal) || valorTotal < 0) {
        throw new ErroValidacao([{ campo: `servicos[${i}].valor_total_centavos`, mensagem: 'Valor inválido' }]);
      }
      return {
        tipo: s.tipo, modelo_id: modeloId, quantidade,
        valor_total_centavos: valorTotal, valor_unitario_centavos: Math.round(valorTotal / quantidade),
      };
    }
    const precoPadrao = Number(obterConfig(db, `preco_servico_${s.tipo}_centavos`) ?? 0);
    const valorUnitario = s.valor_unitario_centavos ?? precoPadrao;
    if (!Number.isInteger(valorUnitario) || valorUnitario < 0) {
      throw new ErroValidacao([{ campo: `servicos[${i}].valor_unitario_centavos`, mensagem: 'Valor inválido' }]);
    }
    return { tipo: s.tipo, modelo_id: null, quantidade: 1, valor_unitario_centavos: valorUnitario };
  });
}

export function rotasProjetos({ db, hoje }) {
  const clientes = repoClientes(db);
  const projetos = repoProjetos(db);
  const projetosServicos = repoProjetosServicos(db);
  const modelos = repoPlacasModelos(db);
  const itensModelo = repoPlacasModelosItens(db);
  const lotes = repoPlacasLotes(db);
  const vendas = repoPlacasVendas(db);
  const r = Router();

  function exigirCliente(clienteId) {
    if (!clientes.obter(clienteId)) {
      throw new ErroValidacao([{ campo: 'cliente_id', mensagem: 'Cliente não encontrado' }]);
    }
  }

  function exigirRegrasDoServico(contexto) {
    const erros = errosDoServico(contexto);
    if (erros.length) throw new ErroValidacao(erros);
  }

  function comServicos(projeto) {
    const modelosTodos = modelos.listar();
    return {
      ...projeto,
      servicos: projetosServicos.listar(projeto.id).map((s) => ({
        ...s,
        modelo_nome: s.tipo === 'placas_nfc' ? (modelosTodos.find((m) => m.id === s.modelo_id)?.nome ?? '—') : null,
      })),
    };
  }

  function criarServicosDoProjeto(projetoId, servicosValidados) {
    for (const s of servicosValidados) projetosServicos.criar({ ...s, projeto_id: projetoId });
  }

  function processarEntregaDePlacas(atual, dados, projetoId) {
    const vaiEntregar = atual.etapa !== 'entregue' && dados.etapa === 'entregue';
    if (!vaiEntregar) return;
    const pendentes = projetosServicos.listarPlacasPendentes(projetoId);
    if (!pendentes.length) return;
    const itensModeloTodos = itensModelo.listar();
    const lotesTodos = lotes.listar();
    for (const linhaServico of pendentes) {
      const resultado = calcularCustoUnitarioModelo(linhaServico.modelo_id, itensModeloTodos, lotesTodos);
      if (resultado.erro === 'sem_receita') {
        throw new ErroValidacao([{ campo: 'servicos', mensagem: 'Modelo de placa sem receita cadastrada, não é possível registrar a venda' }]);
      }
      if (resultado.erro === 'sem_lote') {
        throw new ErroValidacao([{ campo: 'servicos', mensagem: 'Algum material da receita ainda não tem lote comprado' }]);
      }
      const venda = vendas.criar({
        modelo_id: linhaServico.modelo_id,
        quantidade: linhaServico.quantidade,
        preco_vendido_centavos: Math.round(valorLinhaServico(linhaServico) / linhaServico.quantidade),
        custo_unitario_centavos: resultado.custoUnitarioCentavos,
        cliente_id: atual.cliente_id,
        comprador_nome: null,
        data_venda: hoje(),
      });
      projetosServicos.atualizar(linhaServico.id, { venda_id: venda.id });
    }
  }

  r.get('/', (req, res) => {
    const { servico } = req.query;
    if (servico && !SERVICOS.includes(servico)) throw new ErroHttp(400, 'Serviço inválido');
    res.json(projetos.listarComCliente({
      etapa: req.query.etapa,
      cliente_id: req.query.cliente_id,
      postou_instagram: req.query.postou_instagram,
      ficticio: req.query.ficticio,
      servico,
    }).map(comServicos));
  });

  r.post('/', (req, res) => {
    const corpo = req.body ?? {};
    const temServicos = corpo.servicos !== undefined;
    const clienteDaOportunidade = corpo.novo_cliente ? null : (Number(corpo.cliente_id) || null);
    const servicosValidados = temServicos
      ? validarServicos(corpo.servicos, { modelosRepo: modelos, db, clienteId: clienteDaOportunidade })
      : null;

    function prepararDados(dadosValidados) {
      const servico = dadosValidados.servico ?? 'site_sistema';
      exigirRegrasDoServico({
        servico, etapa: dadosValidados.etapa, ficticio: dadosValidados.ficticio,
        tiposLinhas: servicosValidados?.map((s) => s.tipo) ?? null, criando: true,
      });
      let dados = { ...dadosValidados, servico };
      if (servico !== 'site_sistema') dados.etapa = 'andamento';
      if (temServicos) {
        const descontoCentavos = dados.desconto_centavos ?? 0;
        dados = { ...dados, desconto_centavos: descontoCentavos, valor_total_centavos: calcularValorTotal(servicosValidados, descontoCentavos) };
      }
      exigirDadosMensalidade(null, dados);
      return dados;
    }

    function criarProjetoCompleto(dados) {
      const projeto = projetos.criar(dados);
      if (temServicos) criarServicosDoProjeto(projeto.id, servicosValidados);
      return projeto;
    }

    if (corpo.novo_cliente) {
      let dadosCliente;
      try {
        dadosCliente = validar(corpo.novo_cliente, REGRAS_CLIENTE);
      } catch (erro) {
        if (!(erro instanceof ErroValidacao)) throw erro;
        throw new ErroValidacao(erro.erros.map((e) => ({ ...e, campo: `novo_cliente.${e.campo}` })));
      }
      const { cliente_id: _ignorado, ...regrasSemCliente } = REGRAS_PROJETO;
      const dados = prepararDados(aplicarRegrasProjeto(null, validar(corpo, regrasSemCliente), hoje()));
      const criado = emTransacao(db, () => {
        const cliente = clientes.criar(dadosCliente);
        return criarProjetoCompleto({ ...dados, cliente_id: cliente.id });
      });
      return res.status(201).json(comServicos(projetos.obterComCliente(criado.id)));
    }
    const dados = prepararDados(aplicarRegrasProjeto(null, validar(corpo, REGRAS_PROJETO), hoje()));
    exigirCliente(dados.cliente_id);
    const criado = emTransacao(db, () => criarProjetoCompleto(dados));
    res.status(201).json(comServicos(projetos.obterComCliente(criado.id)));
  });

  r.get('/:id', (req, res) => {
    const projeto = projetos.obterComCliente(lerId(req.params.id));
    if (!projeto) throw naoEncontrado('Projeto');
    res.json(comServicos(projeto));
  });

  r.put('/:id', (req, res) => {
    const id = lerId(req.params.id);
    const atual = projetos.obter(id);
    if (!atual) throw naoEncontrado('Projeto');
    const corpo = req.body ?? {};
    const temServicos = corpo.servicos !== undefined;
    const servicosValidados = temServicos
      ? validarServicos(corpo.servicos, { modelosRepo: modelos, db, clienteId: Number(corpo.cliente_id) || atual.cliente_id, projetoId: id })
      : null;

    const dadosBase = aplicarRegrasProjeto(atual, validar(corpo, REGRAS_PROJETO, { parcial: true }), hoje());
    if (dadosBase.servico !== undefined && dadosBase.servico !== atual.servico) {
      throw new ErroValidacao([{ campo: 'servico', mensagem: 'Não é possível mudar o tipo de serviço' }]);
    }
    exigirRegrasDoServico({
      servico: atual.servico, etapa: dadosBase.etapa, ficticio: dadosBase.ficticio,
      tiposLinhas: servicosValidados?.map((s) => s.tipo) ?? null, criando: false,
    });
    exigirDadosMensalidade(atual, dadosBase);
    if (dadosBase.cliente_id !== undefined) exigirCliente(dadosBase.cliente_id);

    emTransacao(db, () => {
      let dados = dadosBase;
      if (temServicos) {
        projetosServicos.removerPorProjetoSemVenda(id);
        criarServicosDoProjeto(id, servicosValidados);
        const descontoCentavos = dados.desconto_centavos ?? atual.desconto_centavos ?? 0;
        dados = { ...dados, desconto_centavos: descontoCentavos, valor_total_centavos: calcularValorTotal(projetosServicos.listar(id), descontoCentavos) };
      }
      processarEntregaDePlacas(atual, dados, id);
      projetos.atualizar(id, dados);
    });
    res.json(comServicos(projetos.obterComCliente(id)));
  });

  r.delete('/:id', (req, res) => {
    if (!projetos.remover(lerId(req.params.id))) throw naoEncontrado('Projeto');
    res.status(204).end();
  });

  return r;
}
