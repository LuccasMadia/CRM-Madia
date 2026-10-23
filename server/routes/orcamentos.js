import { Router } from 'express';
import { repoClientes } from '../repos/clientes.js';
import { repoOrcamentos, repoOrcamentoItens, repoTabelaServicos, repoTabelaPacotes } from '../repos/orcamentos.js';
import { repoPlacasModelos, precoSugeridoPlacas } from '../repos/placas.js';
import { obterConfig } from '../repos/config.js';
import { emTransacao, linha } from '../repos/crud.js';
import { repoProjetos } from '../repos/projetos.js';
import { repoParcelas } from '../repos/parcelas.js';
import { repoPlacasVendas } from '../repos/placas.js';
import { repoCategorias, repoProjetosCategorias } from '../repos/categorias.js';
import {
  calcularTotais, nomeArquivoPdf, DESTINOS, destinosDoItem, valoresComDesconto, MODOS_PARCELAS, planejarParcelas,
  alertasOrcamento,
} from '../domain/orcamentos.js';
import { aplicarRegrasProjeto } from '../domain/regras.js';
import { registrarVendaPlaca } from './placas.js';
import { modeloDocumento, gerarPdf } from '../orcamentos/pdf.js';
import { precoGmnCentavos } from './tabelaPrecos.js';
import { validar, lerId } from '../http/validar.js';
import { ErroHttp, ErroValidacao, naoEncontrado } from '../http/erros.js';

const REGRAS_ORCAMENTO = {
  data: { tipo: 'data', obrigatorio: true },
  validade_dias: { tipo: 'inteiro', min: 1, obrigatorio: true },
  pagamento: { tipo: 'texto', padrao: 'a combinar' },
  prazo: { tipo: 'texto', padrao: 'a combinar' },
  observacao: { tipo: 'texto' },
  situacao: { tipo: 'enum', valores: ['rascunho', 'enviado', 'aceito', 'recusado'], obrigatorio: true },
  desconto_pct: { tipo: 'inteiro', min: 0, max: 100 },
  titulo_pacote: { tipo: 'texto' },
};

const REGRAS_ITEM = {
  nome: { tipo: 'texto', obrigatorio: true },
  frase: { tipo: 'texto' },
  quantidade: { tipo: 'inteiro', min: 1, padrao: 1 },
  valor_unico_centavos: { tipo: 'inteiro', min: 0 },
  valor_mensal_centavos: { tipo: 'inteiro', min: 0 },
};

const REGRAS_ENTRADA = {
  servico_id: { tipo: 'inteiro', min: 1 },
  placa_modelo_id: { tipo: 'inteiro', min: 1 },
  quantidade: { tipo: 'inteiro', min: 1, padrao: 1 },
};

const REGRAS_LIVRE = {
  nome: { tipo: 'texto', obrigatorio: true },
  frase: { tipo: 'texto' },
  valor_unico_centavos: { tipo: 'inteiro', min: 0 },
  valor_mensal_centavos: { tipo: 'inteiro', min: 0 },
};

// Uma escolha por item na conferência do aceite. Item que não vem na lista não cria nada.
const REGRAS_ESCOLHA = {
  item_id: { tipo: 'inteiro', min: 1, obrigatorio: true },
  destino: { tipo: 'enum', valores: DESTINOS, obrigatorio: true },
  // mensal_site / mensal_gmn: o item (site ou GMN) cujo projeto recebe a mensalidade.
  alvo_item_id: { tipo: 'inteiro', min: 1 },
  dia_vencimento: { tipo: 'inteiro', min: 1, max: 31 },
};

const REGRAS_PARCELAS = {
  modo: { tipo: 'enum', valores: MODOS_PARCELAS, obrigatorio: true },
  quantidade: { tipo: 'inteiro', min: 1, max: 60 },
  primeira: { tipo: 'data' },
};

const SITUACOES_SEM_ACEITE = ['rascunho', 'enviado', 'recusado'];

const invalido = (campo, mensagem) => new ErroValidacao([{ campo, mensagem }]);
const num = (v) => Number(v) || 0;

export function rotasOrcamentos({ db, hoje }) {
  const r = Router();
  const clientes = repoClientes(db);
  const orcamentos = repoOrcamentos(db);
  const itens = repoOrcamentoItens(db);
  const servicos = repoTabelaServicos(db);
  const pacotes = repoTabelaPacotes(db);
  const modelos = repoPlacasModelos(db);
  const projetos = repoProjetos(db);
  const parcelas = repoParcelas(db);
  const vendas = repoPlacasVendas(db);
  const categorias = repoCategorias(db);
  const projetosCategorias = repoProjetosCategorias(db);

  // O que o aceite gerou. Só dá para apagar o que ainda não andou: projeto sem parcela paga,
  // venda não recebida e sem placa montada separada para ela.
  function gerados(id) {
    const lista = db.prepare(
      `SELECT p.id, p.titulo, p.servico, p.cliente_id,
              EXISTS (SELECT 1 FROM parcelas pa WHERE pa.projeto_id = p.id AND pa.pago_em IS NOT NULL) AS tem_pago
         FROM projetos p WHERE p.orcamento_id = ? ORDER BY p.id`,
    ).all(id).map(linha);
    const vendidas = db.prepare(
      `SELECT v.id, v.quantidade, v.recebido_em, v.quantidade_montada, m.nome AS modelo_nome
         FROM placas_vendas v JOIN placas_modelos m ON m.id = v.modelo_id WHERE v.orcamento_id = ? ORDER BY v.id`,
    ).all(id).map(linha);
    return {
      projetos: lista.map(({ tem_pago, ...p }) => ({ ...p, pode_apagar: !tem_pago })),
      vendas: vendidas.map((v) => ({
        id: v.id, modelo_nome: v.modelo_nome, quantidade: v.quantidade,
        pode_apagar: !v.recebido_em && v.quantidade_montada === 0,
      })),
    };
  }

  const temGerados = (id) => !!db.prepare(
    'SELECT 1 FROM projetos WHERE orcamento_id = ?1 UNION ALL SELECT 1 FROM placas_vendas WHERE orcamento_id = ?1 LIMIT 1',
  ).get(id);

  const itensDoOrcamento = (id) =>
    db.prepare(
      `SELECT oi.*, ts.tipo AS tipo_servico
         FROM orcamento_itens oi LEFT JOIN tabela_servicos ts ON ts.id = oi.servico_id
        WHERE oi.orcamento_id = ? ORDER BY oi.ordem, oi.id`,
    ).all(id).map((i) => ({ ...i }));

  // Há item de serviço com hospedagem opcional e nenhum item de hospedagem.
  function sugerirHospedagem(id) {
    const tem = (cond) => !!db.prepare(
      `SELECT 1 FROM orcamento_itens oi JOIN tabela_servicos ts ON ts.id = oi.servico_id
        WHERE oi.orcamento_id = ? AND ${cond} LIMIT 1`,
    ).get(id);
    return tem("ts.hospedagem = 'opcional'") && !tem("ts.tipo = 'hospedagem'");
  }

  function montar(orcamento) {
    const lista = itensDoOrcamento(orcamento.id);
    return {
      ...orcamento,
      numero: orcamento.id,
      cliente_nome: clientes.obter(orcamento.cliente_id)?.nome ?? null,
      itens: lista,
      totais: calcularTotais(lista, orcamento.desconto_pct),
      sugerir_hospedagem: sugerirHospedagem(orcamento.id),
      gerados: gerados(orcamento.id),
    };
  }

  const carregar = (idParam) => {
    const orcamento = orcamentos.obter(lerId(idParam));
    if (!orcamento) throw naoEncontrado('Orçamento');
    return orcamento;
  };

  function carregarItem(orcamento, itemParam) {
    const item = itens.obter(lerId(itemParam));
    if (!item || item.orcamento_id !== orcamento.id) throw naoEncontrado('Item');
    return item;
  }

  // Valida a entrada e devolve o item pronto para gravar; não escreve nada.
  function prepararItem(orcamento, corpo) {
    if (corpo?.livre === true) {
      const dados = validar(corpo, REGRAS_LIVRE);
      if (dados.valor_unico_centavos == null && dados.valor_mensal_centavos == null) {
        throw invalido('valor_unico_centavos', 'Informe o valor único ou o mensal');
      }
      return { servico: null, dados: { ...dados, quantidade: 1, servico_id: null, placa_modelo_id: null } };
    }
    const entrada = validar(corpo, { ...REGRAS_ENTRADA, servico_id: { ...REGRAS_ENTRADA.servico_id, obrigatorio: true } });
    entrada.quantidade ??= 1;
    const servico = servicos.obter(entrada.servico_id);
    if (!servico) throw naoEncontrado('Serviço');
    if (!servico.ativo) throw new ErroHttp(409, 'Este serviço está desativado na tabela de preços.');
    const base = {
      servico_id: servico.id, placa_modelo_id: null, nome: servico.nome, frase: servico.frase,
      quantidade: entrada.quantidade, valor_unico_centavos: servico.valor_unico_centavos,
      valor_mensal_centavos: servico.valor_mensal_centavos,
    };
    if (servico.tipo === 'gmn_config') base.valor_unico_centavos = precoGmnCentavos(db);
    if (servico.tipo === 'placa') {
      const modelo = entrada.placa_modelo_id ? modelos.obter(entrada.placa_modelo_id) : null;
      if (!modelo) throw invalido('placa_modelo_id', 'Escolha o modelo da placa');
      base.placa_modelo_id = modelo.id;
      base.nome = `Placa NFC — ${modelo.nome}`;
      base.valor_unico_centavos = precoSugeridoPlacas(db, {
        modelo, quantidade: entrada.quantidade, clienteId: orcamento.cliente_id,
      }).total_centavos;
    }
    return { servico, dados: base };
  }

  const temHospedagem = (id) => !!db.prepare(
    `SELECT 1 FROM orcamento_itens oi JOIN tabela_servicos ts ON ts.id = oi.servico_id
      WHERE oi.orcamento_id = ? AND ts.tipo = 'hospedagem' LIMIT 1`,
  ).get(id);

  // Grava os itens preparados e, depois de todos, a hospedagem se algum serviço a exige e o orçamento
  // ainda não tem. Um item de hospedagem repetido é ignorado. Sem transação própria:
  // quem chama envolve em emTransacao.
  function gravarItens(orcamento, preparados) {
    for (const { servico, dados } of preparados) {
      if (servico?.tipo === 'hospedagem' && temHospedagem(orcamento.id)) continue;
      itens.criar({ ...dados, orcamento_id: orcamento.id, ordem: itens.proximaOrdem(orcamento.id) });
    }
    if (!preparados.some(({ servico }) => servico?.hospedagem === 'obrigatoria') || temHospedagem(orcamento.id)) return;
    const hospedagem = servicos.listar({ tipo: 'hospedagem' })[0];
    if (!hospedagem || !hospedagem.ativo) return;
    const { dados } = prepararItem(orcamento, { servico_id: hospedagem.id });
    itens.criar({ ...dados, orcamento_id: orcamento.id, ordem: itens.proximaOrdem(orcamento.id) });
  }

  r.get('/clientes/:id/orcamentos', (req, res) => {
    const cliente = clientes.obter(lerId(req.params.id));
    if (!cliente) throw naoEncontrado('Cliente');
    res.json(orcamentos.listarDoCliente(cliente.id).map((o) => {
      const { totais } = montar(o);
      return { id: o.id, numero: o.id, data: o.data, situacao: o.situacao, totais };
    }));
  });

  r.post('/clientes/:id/orcamentos', (req, res) => {
    const cliente = clientes.obter(lerId(req.params.id));
    if (!cliente) throw naoEncontrado('Cliente');
    const orcamento = orcamentos.criar({
      cliente_id: cliente.id,
      data: hoje(),
      desconto_pct: Number(obterConfig(db, 'orcamento_desconto_combo_pct') ?? 10),
    });
    res.status(201).json(montar(orcamento));
  });

  r.get('/orcamentos/:id', (req, res) => res.json(montar(carregar(req.params.id))));

  r.get('/orcamentos/:id/pdf', async (req, res) => {
    const orc = montar(carregar(req.params.id));
    const pdf = await gerarPdf(modeloDocumento(orc, { whatsapp: obterConfig(db, 'contato_whatsapp') }));
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${nomeArquivoPdf(orc.numero, orc.cliente_nome)}"`,
    });
    res.send(pdf);
  });

  // Todos os orçamentos, com o que pede atenção calculado aqui (o `hoje` do servidor vale para os testes).
  r.get('/orcamentos', (req, res) => {
    const dia = hoje();
    const lista = db.prepare(
      `SELECT o.*, c.nome AS cliente_nome,
              MAX(o.atualizado_em, COALESCE((SELECT MAX(i.atualizado_em) FROM orcamento_itens i WHERE i.orcamento_id = o.id), '')) AS mexido
         FROM orcamentos o JOIN clientes c ON c.id = o.cliente_id ORDER BY o.id DESC`,
    ).all().map(linha);
    res.json(lista.map((o) => ({
      id: o.id,
      numero: o.id,
      cliente_id: o.cliente_id,
      cliente_nome: o.cliente_nome,
      data: o.data,
      validade_dias: o.validade_dias,
      situacao: o.situacao,
      totais: calcularTotais(itensDoOrcamento(o.id), o.desconto_pct),
      gerou: temGerados(o.id),
      ...alertasOrcamento({ ...o, mexido_em: o.mexido.slice(0, 10) }, dia),
    })));
  });

  r.put('/orcamentos/:id', (req, res) => {
    const orcamento = carregar(req.params.id);
    const dados = validar(req.body, REGRAS_ORCAMENTO, { parcial: true });
    // Aceitar cria projetos e vendas: passa pela conferência (/aceitar). Só se já gerou algo
    // (e o Lucca manteve ao desfazer) é que volta a "aceito" direto, sem gerar de novo.
    if (dados.situacao === 'aceito' && orcamento.situacao !== 'aceito' && !temGerados(orcamento.id)) {
      throw new ErroHttp(409, 'Para aceitar, confira antes o que o orçamento vai criar.');
    }
    res.json(montar(orcamentos.atualizar(orcamento.id, dados)));
  });

  // Valida as escolhas da conferência e devolve o plano; não grava nada.
  function planejarAceite(orcamento, lista, escolhasBrutas) {
    if (!Array.isArray(escolhasBrutas)) throw invalido('escolhas', 'Deve ser uma lista');
    const porItem = new Map();
    for (const bruta of escolhasBrutas) {
      const e = validar(bruta, REGRAS_ESCOLHA);
      const item = lista.find((i) => i.id === e.item_id);
      if (!item) throw new ErroHttp(400, 'Há um item que não é deste orçamento.');
      if (porItem.has(item.id)) throw new ErroHttp(400, `${item.nome}: escolhido duas vezes.`);
      if (!destinosDoItem(item).includes(e.destino)) throw new ErroHttp(400, `${item.nome}: este item não pode virar isso.`);
      const parcelasEscolhidas = bruta.parcelas == null ? { modo: 'nenhuma' } : validar(bruta.parcelas, REGRAS_PARCELAS);
      parcelasEscolhidas.primeira ??= hoje();
      porItem.set(item.id, { ...e, item, parcelas: parcelasEscolhidas });
    }
    const escolhas = lista.map((item) => porItem.get(item.id) ?? { item_id: item.id, destino: 'nenhum', item, parcelas: { modo: 'nenhuma' } });

    // Cada mensalidade precisa de um projeto, e cada projeto recebe uma mensalidade só.
    const sites = escolhas.filter((e) => e.destino === 'site');
    const gmns = escolhas.filter((e) => e.destino === 'gmn');
    const ocupados = new Set(sites.filter((e) => num(e.item.valor_mensal_centavos) > 0).map((e) => e.item.id));
    for (const e of escolhas.filter((x) => x.destino === 'mensal_site' || x.destino === 'mensal_gmn')) {
      const candidatos = e.destino === 'mensal_site' ? sites : gmns;
      if (e.alvo_item_id) {
        e.alvo = candidatos.find((c) => c.item.id === e.alvo_item_id);
        if (!e.alvo) throw new ErroHttp(400, `${e.item.nome}: o projeto escolhido para a mensalidade não será criado.`);
      } else if (e.destino === 'mensal_site') {
        if (!sites.length) throw new ErroHttp(400, `${e.item.nome}: nenhum site será criado para receber a mensalidade.`);
        if (sites.length > 1) throw new ErroHttp(400, `${e.item.nome}: escolha em qual site entra a mensalidade.`);
        [e.alvo] = sites;
      } else {
        e.alvo = gmns[0] ?? null; // sem GMN no orçamento: cria um só para a gestão
      }
      const chave = e.alvo ? e.alvo.item.id : 'gmn-novo';
      if (ocupados.has(chave)) throw new ErroHttp(400, `${e.item.nome}: esse projeto já recebe outra mensalidade.`);
      ocupados.add(chave);
    }
    const { desconto_centavos } = calcularTotais(lista, orcamento.desconto_pct);
    return { escolhas, valores: valoresComDesconto(lista, desconto_centavos) };
  }

  // Sem transação própria: quem chama envolve em emTransacao.
  function executarAceite(orcamento, { escolhas, valores }) {
    const dia = hoje();
    const diaDoMes = Number(dia.slice(8, 10));
    // Categoria cujo nome aparece no item ("Landing page", "Sistema de agendamento"); senão, Site.
    const todasCategorias = categorias.listarOrdenadas();
    const categoriaDo = (nome) => todasCategorias.find((c) => nome.toLowerCase().includes(c.nome.toLowerCase()))?.id
      ?? categorias.idComNome('Site') ?? todasCategorias[0]?.id ?? null;
    const criados = new Map(); // item.id -> projeto

    function criarProjeto(dados, escolhaParcelas) {
      const projeto = projetos.criar(aplicarRegrasProjeto(null, {
        ...dados, cliente_id: orcamento.cliente_id, orcamento_id: orcamento.id,
      }, dia));
      for (const p of planejarParcelas(dados.valor_total_centavos, escolhaParcelas)) {
        parcelas.criar({ ...p, projeto_id: projeto.id });
      }
      return projeto;
    }

    // Site começa a cobrar na entrega (o padrão do projeto); GMN começa hoje, como ao ligar pelo perfil.
    function ligarMensalidade(projeto, valorCentavos, diaVencimento) {
      projetos.atualizar(projeto.id, {
        mensalidade_ativa: 1,
        mensalidade_valor_centavos: valorCentavos,
        mensalidade_dia_vencimento: diaVencimento ?? diaDoMes,
        ...(projeto.servico === 'site_sistema' ? {} : { mensalidade_inicio_modo: 'data', mensalidade_inicio_data: dia }),
      });
    }

    for (const e of escolhas) {
      const valor = valores[e.item.id] ?? 0;
      if (e.destino === 'site') {
        const projeto = criarProjeto({
          servico: 'site_sistema', titulo: e.item.nome, descricao: e.item.frase || null,
          etapa: 'valor_definido', valor_total_centavos: valor,
        }, e.parcelas);
        const categoria = categoriaDo(e.item.nome);
        if (categoria) projetosCategorias.substituir(projeto.id, [categoria]);
        if (num(e.item.valor_mensal_centavos) > 0) ligarMensalidade(projeto, e.item.valor_mensal_centavos, e.dia_vencimento);
        criados.set(e.item.id, projeto);
      } else if (e.destino === 'gmn') {
        criados.set(e.item.id, criarProjeto({
          servico: 'google_meu_negocio', titulo: 'Google Meu Negócio', etapa: 'andamento', valor_total_centavos: valor,
        }, e.parcelas));
      } else if (e.destino === 'placa') {
        const modelo = e.item.placa_modelo_id ? modelos.obter(e.item.placa_modelo_id) : null;
        if (!modelo) throw new ErroHttp(400, `${e.item.nome}: o modelo da placa não existe mais.`);
        try {
          registrarVendaPlaca(db, {
            modelo, quantidade: e.item.quantidade, quantidade_montada: 0,
            preco_vendido_centavos: Math.round(valor / e.item.quantidade),
            cliente_id: orcamento.cliente_id, comprador_nome: null, data_venda: dia, recebido_em: null,
            orcamento_id: orcamento.id,
          });
        } catch (erro) {
          if (!(erro instanceof ErroValidacao)) throw erro;
          throw new ErroHttp(400, `${e.item.nome}: ${erro.erros.map((x) => x.mensagem).join('; ')}`);
        }
      }
    }

    for (const e of escolhas.filter((x) => x.destino === 'mensal_site' || x.destino === 'mensal_gmn')) {
      const projeto = e.alvo
        ? projetos.obter(criados.get(e.alvo.item.id).id)
        : criarProjeto({ servico: 'google_meu_negocio', titulo: 'Google Meu Negócio', etapa: 'andamento', valor_total_centavos: 0 }, { modo: 'nenhuma' });
      ligarMensalidade(projeto, num(e.item.valor_mensal_centavos), e.dia_vencimento);
    }
    orcamentos.atualizar(orcamento.id, { situacao: 'aceito' });
  }

  r.post('/orcamentos/:id/aceitar', (req, res) => {
    const orcamento = carregar(req.params.id);
    if (temGerados(orcamento.id)) {
      throw new ErroHttp(409, 'Este orçamento já gerou projetos ou vendas: não dá para gerar de novo.');
    }
    const plano = planejarAceite(orcamento, itensDoOrcamento(orcamento.id), req.body?.escolhas ?? []);
    emTransacao(db, () => executarAceite(orcamento, plano));
    res.json(montar(orcamentos.obter(orcamento.id)));
  });

  // Sai de "aceito". Com apagar, some o que foi gerado e ainda não andou; o resto fica e continua ligado.
  r.post('/orcamentos/:id/desfazer', (req, res) => {
    const orcamento = carregar(req.params.id);
    const { situacao } = validar(req.body, { situacao: { tipo: 'enum', valores: SITUACOES_SEM_ACEITE, obrigatorio: true } });
    const apagar = req.body?.apagar === true;
    emTransacao(db, () => {
      if (apagar) {
        const { projetos: lista, vendas: vendidas } = gerados(orcamento.id);
        for (const p of lista.filter((x) => x.pode_apagar)) projetos.remover(p.id);
        for (const v of vendidas.filter((x) => x.pode_apagar)) vendas.remover(v.id);
      }
      orcamentos.atualizar(orcamento.id, { situacao });
    });
    res.json(montar(orcamentos.obter(orcamento.id)));
  });

  r.delete('/orcamentos/:id', (req, res) => {
    orcamentos.remover(carregar(req.params.id).id);
    res.status(204).end();
  });

  r.post('/orcamentos/:id/duplicar', (req, res) => {
    const origem = carregar(req.params.id);
    const copia = emTransacao(db, () => {
      const nova = orcamentos.criar({ ...origem, data: hoje(), situacao: 'rascunho' });
      for (const i of itens.listarDo(origem.id)) itens.criar({ ...i, orcamento_id: nova.id });
      return nova;
    });
    res.status(201).json(montar(copia));
  });

  r.post('/orcamentos/:id/itens', (req, res) => {
    const orcamento = carregar(req.params.id);
    const preparado = prepararItem(orcamento, req.body);
    emTransacao(db, () => gravarItens(orcamento, [preparado]));
    res.status(201).json(montar(orcamento));
  });

  r.put('/orcamentos/:id/itens/:itemId', (req, res) => {
    const orcamento = carregar(req.params.id);
    const item = carregarItem(orcamento, req.params.itemId);
    const dados = validar(req.body, REGRAS_ITEM, { parcial: true });
    // Placa: o preço acompanha a quantidade (packs), a menos que o valor venha explícito.
    if (dados.quantidade != null && dados.quantidade !== item.quantidade && dados.valor_unico_centavos === undefined
      && item.servico_id && servicos.obter(item.servico_id)?.tipo === 'placa') {
      const modelo = item.placa_modelo_id ? modelos.obter(item.placa_modelo_id) : null;
      if (modelo) {
        dados.valor_unico_centavos = precoSugeridoPlacas(db, {
          modelo, quantidade: dados.quantidade, clienteId: orcamento.cliente_id,
        }).total_centavos;
      }
    }
    itens.atualizar(item.id, dados);
    res.json(montar(orcamento));
  });

  r.delete('/orcamentos/:id/itens/:itemId', (req, res) => {
    const orcamento = carregar(req.params.id);
    itens.remover(carregarItem(orcamento, req.params.itemId).id);
    res.json(montar(orcamento));
  });

  r.post('/orcamentos/:id/pacote', (req, res) => {
    const orcamento = carregar(req.params.id);
    const { pacote_id, opcionais = [], placa_modelo_id } = req.body ?? {};
    const pacote = Number.isInteger(pacote_id) ? pacotes.listarComItens().find((p) => p.id === pacote_id) : null;
    if (!pacote) throw naoEncontrado('Pacote');
    if (!Array.isArray(opcionais) || !opcionais.every(Number.isInteger)) {
      throw invalido('opcionais', 'Deve ser uma lista de ids');
    }
    const escolhidos = pacote.itens.filter((i) => !i.opcional || opcionais.includes(i.id));
    // Tudo é validado antes de gravar: se algo falha, o orçamento não muda.
    const preparados = escolhidos.map((i) => prepararItem(orcamento, {
      servico_id: i.servico_id,
      quantidade: i.quantidade,
      placa_modelo_id: i.placa_modelo_id ?? placa_modelo_id ?? undefined,
    }));
    emTransacao(db, () => {
      gravarItens(orcamento, preparados);
      orcamentos.atualizar(orcamento.id, { titulo_pacote: pacote.nome });
    });
    res.json(montar(orcamentos.obter(orcamento.id)));
  });

  return r;
}
