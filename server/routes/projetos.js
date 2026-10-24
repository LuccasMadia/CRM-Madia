import { Router } from 'express';
import { repoClientes } from '../repos/clientes.js';
import { repoProjetos } from '../repos/projetos.js';
import { repoProjetosServicos } from '../repos/servicos.js';
import { repoParcelas } from '../repos/parcelas.js';
import { planejarCobrancaUnica } from '../domain/cobranca.js';
import { repoPlacasModelos, repoPlacasModelosItens, repoPlacasLotes, repoPlacasVendas, precoSugeridoPlacas, montadasDisponiveis } from '../repos/placas.js';
import { obterConfig } from '../repos/config.js';
import { emTransacao } from '../repos/crud.js';
import { validar, lerId } from '../http/validar.js';
import { ErroHttp, ErroValidacao, naoEncontrado } from '../http/erros.js';
import { ETAPAS, aplicarRegrasProjeto } from '../domain/regras.js';
import { SERVICOS, TIPOS_SERVICO, calcularValorTotal, errosDoServico, valorLinhaServico } from '../domain/servicos.js';
import { calcularCustoUnitarioModelo } from '../domain/placas.js';
import { repoCategorias, repoNichos, repoProjetosCategorias } from '../repos/categorias.js';
import { MODOS_INICIO_MENSALIDADE, planejarMensalidadesAbertas } from '../domain/mensalidade.js';
import { REGRAS_CLIENTE } from './clientes.js';
import { repoModelosTarefas, aplicarModelo } from '../repos/tarefas.js';

const REGRAS_PROJETO = {
  cliente_id: { tipo: 'inteiro', obrigatorio: true },
  titulo: { tipo: 'texto', obrigatorio: true },
  descricao: { tipo: 'texto' },
  etapa: { tipo: 'enum', valores: ETAPAS, padrao: 'ideia' },
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
  nicho_id: { tipo: 'inteiro', min: 1 },
  mensalidade_inicio_modo: { tipo: 'enum', valores: MODOS_INICIO_MENSALIDADE },
  mensalidade_inicio_data: { tipo: 'data' },
  prototipo_pronto: { tipo: 'bool', padrao: 0 },
  teste_inicio: { tipo: 'data' },
};

const REGRA_VENCIMENTO = { vencimento: { tipo: 'data' } };
const REGRA_MODELO_TAREFAS = { modelo_tarefas_id: { tipo: 'inteiro', min: 1 } };

function exigirDadosMensalidade(atual, dados) {
  const ativa = dados.mensalidade_ativa ?? atual?.mensalidade_ativa ?? 0;
  if (!ativa) return;
  const valor = dados.mensalidade_valor_centavos ?? atual?.mensalidade_valor_centavos;
  const dia = dados.mensalidade_dia_vencimento ?? atual?.mensalidade_dia_vencimento;
  const erros = [];
  if (!valor) erros.push({ campo: 'mensalidade_valor_centavos', mensagem: 'Obrigatório quando a mensalidade está ativa' });
  if (!dia) erros.push({ campo: 'mensalidade_dia_vencimento', mensagem: 'Obrigatório quando a mensalidade está ativa' });
  const modo = dados.mensalidade_inicio_modo ?? atual?.mensalidade_inicio_modo ?? 'entrega';
  const dataInicio = 'mensalidade_inicio_data' in dados ? dados.mensalidade_inicio_data : atual?.mensalidade_inicio_data;
  if (modo === 'data' && !dataInicio) {
    erros.push({ campo: 'mensalidade_inicio_data', mensagem: 'Obrigatório quando a cobrança começa numa data' });
  }
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
  const categorias = repoCategorias(db);
  const nichos = repoNichos(db);
  const projetosCategorias = repoProjetosCategorias(db);
  const modelos = repoPlacasModelos(db);
  const itensModelo = repoPlacasModelosItens(db);
  const lotes = repoPlacasLotes(db);
  const vendas = repoPlacasVendas(db);
  const parcelas = repoParcelas(db);
  const r = Router();

  function sincronizarCobrancaUnica(projetoId, vencimento) {
    const projeto = projetos.obter(projetoId);
    if (projeto.servico === 'site_sistema') return;
    const plano = planejarCobrancaUnica(parcelas.listarAvulsas(projetoId), { valorCentavos: projeto.valor_total_centavos, vencimento });
    if (plano.acao === 'criar') {
      parcelas.criar({ projeto_id: projetoId, descricao: 'Pagamento', valor_centavos: plano.valor_centavos, vencimento: plano.vencimento });
    } else if (plano.acao === 'atualizar') {
      parcelas.atualizar(plano.id, { valor_centavos: plano.valor_centavos, vencimento: plano.vencimento });
    } else if (plano.acao === 'remover') {
      parcelas.remover(plano.id);
    }
  }

  // A mensalidade tem uma fonte só (o projeto): as já criadas e ainda não vencidas acompanham o que mudou.
  function sincronizarMensalidadesAbertas(antes, apagarAbertas) {
    const depois = projetos.obter(antes.id);
    const abertas = parcelas.listar({ projeto_id: antes.id, mensalidade: 1 }).filter((p) => !p.pago_em);
    for (const passo of planejarMensalidadesAbertas(abertas, antes, depois, hoje(), { apagarAbertas })) {
      if (passo.acao === 'remover') parcelas.remover(passo.id);
      else parcelas.atualizar(passo.id, { valor_centavos: passo.valor_centavos, vencimento: passo.vencimento });
    }
  }

  function exigirCliente(clienteId) {
    if (!clientes.obter(clienteId)) {
      throw new ErroValidacao([{ campo: 'cliente_id', mensagem: 'Cliente não encontrado' }]);
    }
  }

  function exigirRegrasDoServico(contexto) {
    const erros = errosDoServico(contexto);
    if (erros.length) throw new ErroValidacao(erros);
  }

  function categoriaPadrao() {
    const id = categorias.idComNome('Site') ?? categorias.listarOrdenadas()[0]?.id;
    if (!id) throw new ErroValidacao([{ campo: 'categorias', mensagem: 'Cadastre uma categoria em Configurações' }]);
    return id;
  }

  // null = não mexer nas categorias.
  function validarCategorias(bruto, servico, { criando }) {
    if (servico !== 'site_sistema') {
      if (bruto !== undefined) throw new ErroValidacao([{ campo: 'categorias', mensagem: 'Só sites e sistemas têm categorias' }]);
      return null;
    }
    if (bruto === undefined) return criando ? [categoriaPadrao()] : null;
    if (!Array.isArray(bruto) || !bruto.every((id) => Number.isInteger(id) && id > 0)) {
      throw new ErroValidacao([{ campo: 'categorias', mensagem: 'Deve ser uma lista de categorias' }]);
    }
    const ids = [...new Set(bruto)];
    if (!ids.length) throw new ErroValidacao([{ campo: 'categorias', mensagem: 'Escolha pelo menos uma categoria' }]);
    if (ids.some((id) => !categorias.obter(id))) throw new ErroValidacao([{ campo: 'categorias', mensagem: 'Categoria não encontrada' }]);
    return ids;
  }

  function exigirNicho(nichoId) {
    if (nichoId != null && !nichos.obter(nichoId)) {
      throw new ErroValidacao([{ campo: 'nicho_id', mensagem: 'Nicho não encontrado' }]);
    }
  }

  // Site que já cobrou mensalidade e volta a cobrar sem escolher outro início (o modo e a data são os guardados).
  function retomandoSemNovoInicio(atual, dados) {
    if (!atual || !parcelas.listar({ projeto_id: atual.id, mensalidade: 1 }).length) return false;
    const modo = dados.mensalidade_inicio_modo ?? atual.mensalidade_inicio_modo;
    const data = ('mensalidade_inicio_data' in dados ? dados.mensalidade_inicio_data : atual.mensalidade_inicio_data) ?? null;
    return modo === atual.mensalidade_inicio_modo && data === (atual.mensalidade_inicio_data ?? null);
  }

  // Ligar a mensalidade começa a cobrar hoje: GMN/placas sem data (como antes) e site retomado após uma pausa
  // (assim os meses pausados não viram mensalidades atrasadas).
  function inicioAoLigar(servico, atual, dados) {
    const ligando = dados.mensalidade_ativa && !atual?.mensalidade_ativa;
    if (!ligando) return dados;
    const comecaHoje = servico === 'site_sistema' ? retomandoSemNovoInicio(atual, dados) : !dados.mensalidade_inicio_data;
    if (!comecaHoje) return dados;
    return { ...dados, mensalidade_inicio_modo: 'data', mensalidade_inicio_data: hoje() };
  }

  function comServicos(projeto) {
    const modelosTodos = modelos.listar();
    return {
      ...projeto,
      categorias: projetosCategorias.listar(projeto.id),
      servicos: projetosServicos.listar(projeto.id).map((s) => ({
        ...s,
        modelo_nome: s.tipo === 'placas_nfc' ? (modelosTodos.find((m) => m.id === s.modelo_id)?.nome ?? '—') : null,
      })),
    };
  }

  // Venda de placas já entregue: só aceita reenviar a mesma linha (o formulário pode reenviar sem mudar nada).
  function linhasParaTrocar(projetoId, servicosValidados) {
    if (!servicosValidados) return null;
    const vendida = projetosServicos.listar(projetoId).find((l) => l.tipo === 'placas_nfc' && l.venda_id);
    if (!vendida) return servicosValidados;
    const [nova] = servicosValidados;
    const igual = nova && nova.modelo_id === vendida.modelo_id && nova.quantidade === vendida.quantidade
      && valorLinhaServico(nova) === valorLinhaServico(vendida);
    if (!igual) {
      throw new ErroValidacao([{ campo: 'servicos', mensagem: 'Venda já entregue: modelo, quantidade e valor não podem mudar' }]);
    }
    return null;
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
        // O dinheiro desta venda entra pelas parcelas do projeto.
        recebido_em: hoje(),
        quantidade_montada: Math.min(linhaServico.quantidade, Math.max(0, montadasDisponiveis(db, linhaServico.modelo_id))),
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
    const { vencimento } = validar(corpo, REGRA_VENCIMENTO, { parcial: true });
    // "Criar tarefas do modelo X": o modelo é aplicado junto, na mesma transação.
    const { modelo_tarefas_id: modeloId } = validar(corpo, REGRA_MODELO_TAREFAS, { parcial: true });
    const modeloTarefas = modeloId ? repoModelosTarefas(db).obter(modeloId) : null;
    if (modeloId && !modeloTarefas) throw new ErroValidacao([{ campo: 'modelo_tarefas_id', mensagem: 'Modelo de tarefas não encontrado' }]);

    let categoriasValidadas = null;

    function prepararDados(dadosValidados) {
      const servico = dadosValidados.servico ?? 'site_sistema';
      categoriasValidadas = validarCategorias(corpo.categorias, servico, { criando: true });
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
      dados = inicioAoLigar(servico, null, dados);
      exigirNicho(dados.nicho_id);
      exigirDadosMensalidade(null, dados);
      if (servico !== 'site_sistema' && !dados.mensalidade_ativa && dados.valor_total_centavos > 0 && !vencimento) {
        throw new ErroValidacao([{ campo: 'vencimento', mensagem: 'Obrigatório para cobrança única' }]);
      }
      return dados;
    }

    function criarProjetoCompleto(dados) {
      const projeto = projetos.criar(dados);
      if (categoriasValidadas) projetosCategorias.substituir(projeto.id, categoriasValidadas);
      if (temServicos) criarServicosDoProjeto(projeto.id, servicosValidados);
      sincronizarCobrancaUnica(projeto.id, vencimento);
      if (modeloTarefas) aplicarModelo(db, modeloTarefas, projeto, hoje());
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
    const { vencimento } = validar(corpo, REGRA_VENCIMENTO, { parcial: true });
    if (dadosBase.servico !== undefined && dadosBase.servico !== atual.servico) {
      throw new ErroValidacao([{ campo: 'servico', mensagem: 'Não é possível mudar o tipo de serviço' }]);
    }
    exigirRegrasDoServico({
      servico: atual.servico, etapa: dadosBase.etapa, ficticio: dadosBase.ficticio,
      tiposLinhas: servicosValidados?.map((s) => s.tipo) ?? null, criando: false,
    });
    const linhasNovas = atual.servico === 'placas_nfc' ? linhasParaTrocar(id, servicosValidados) : servicosValidados;
    const categoriasValidadas = validarCategorias(corpo.categorias, atual.servico, { criando: false });
    exigirNicho(dadosBase.nicho_id);
    const dadosMensalidade = inicioAoLigar(atual.servico, atual, dadosBase);
    exigirDadosMensalidade(atual, dadosMensalidade);
    if (dadosBase.cliente_id !== undefined) exigirCliente(dadosBase.cliente_id);

    emTransacao(db, () => {
      let dados = dadosMensalidade;
      if (linhasNovas) {
        projetosServicos.removerPorProjetoSemVenda(id);
        criarServicosDoProjeto(id, linhasNovas);
        const descontoCentavos = dados.desconto_centavos ?? atual.desconto_centavos ?? 0;
        dados = { ...dados, desconto_centavos: descontoCentavos, valor_total_centavos: calcularValorTotal(projetosServicos.listar(id), descontoCentavos) };
      }
      processarEntregaDePlacas(atual, dados, id);
      projetos.atualizar(id, dados);
      if (categoriasValidadas) projetosCategorias.substituir(id, categoriasValidadas);
      sincronizarCobrancaUnica(id, vencimento);
      sincronizarMensalidadesAbertas(atual, corpo.apagar_mensalidades_abertas === true);
    });
    res.json(comServicos(projetos.obterComCliente(id)));
  });

  r.delete('/:id', (req, res) => {
    if (!projetos.remover(lerId(req.params.id))) throw naoEncontrado('Projeto');
    res.status(204).end();
  });

  return r;
}
