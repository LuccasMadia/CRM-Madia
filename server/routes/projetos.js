import { Router } from 'express';
import { repoClientes } from '../repos/clientes.js';
import { repoProjetos } from '../repos/projetos.js';
import { repoProjetosServicos } from '../repos/servicos.js';
import { repoPlacasModelos, repoPlacasModelosItens, repoPlacasLotes, repoPlacasVendas } from '../repos/placas.js';
import { obterConfig } from '../repos/config.js';
import { emTransacao } from '../repos/crud.js';
import { validar, lerId } from '../http/validar.js';
import { ErroValidacao, naoEncontrado } from '../http/erros.js';
import { ETAPAS, aplicarRegrasProjeto } from '../domain/regras.js';
import { TIPOS_SERVICO, calcularValorTotal } from '../domain/servicos.js';
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

function validarServicos(servicosBrutos, { modelosRepo, db }) {
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
      const valorUnitario = s.valor_unitario_centavos ?? modelo.preco_venda_centavos;
      if (!Number.isInteger(valorUnitario) || valorUnitario < 0) {
        throw new ErroValidacao([{ campo: `servicos[${i}].valor_unitario_centavos`, mensagem: 'Valor inválido' }]);
      }
      return { tipo: s.tipo, modelo_id: modeloId, quantidade, valor_unitario_centavos: valorUnitario };
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

  r.get('/', (req, res) => {
    res.json(projetos.listarComCliente({
      etapa: req.query.etapa,
      cliente_id: req.query.cliente_id,
      postou_instagram: req.query.postou_instagram,
      ficticio: req.query.ficticio,
    }).map(comServicos));
  });

  r.post('/', (req, res) => {
    const corpo = req.body ?? {};
    const temServicos = corpo.servicos !== undefined;
    const servicosValidados = temServicos ? validarServicos(corpo.servicos, { modelosRepo: modelos, db }) : null;

    function comValorDosServicos(dados) {
      if (!temServicos) return dados;
      const descontoCentavos = dados.desconto_centavos ?? 0;
      return { ...dados, desconto_centavos: descontoCentavos, valor_total_centavos: calcularValorTotal(servicosValidados, descontoCentavos) };
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
      const dados = comValorDosServicos(aplicarRegrasProjeto(null, validar(corpo, regrasSemCliente), hoje()));
      exigirDadosMensalidade(null, dados);
      const criado = emTransacao(db, () => {
        const cliente = clientes.criar(dadosCliente);
        const projeto = projetos.criar({ ...dados, cliente_id: cliente.id });
        if (temServicos) criarServicosDoProjeto(projeto.id, servicosValidados);
        return projeto;
      });
      return res.status(201).json(comServicos(projetos.obterComCliente(criado.id)));
    }
    const dados = comValorDosServicos(aplicarRegrasProjeto(null, validar(corpo, REGRAS_PROJETO), hoje()));
    exigirDadosMensalidade(null, dados);
    exigirCliente(dados.cliente_id);
    const criado = temServicos
      ? emTransacao(db, () => {
          const projeto = projetos.criar(dados);
          criarServicosDoProjeto(projeto.id, servicosValidados);
          return projeto;
        })
      : projetos.criar(dados);
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
    const servicosValidados = temServicos ? validarServicos(corpo.servicos, { modelosRepo: modelos, db }) : null;

    const dadosBase = aplicarRegrasProjeto(atual, validar(corpo, REGRAS_PROJETO, { parcial: true }), hoje());
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
