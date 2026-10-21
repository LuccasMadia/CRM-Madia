import { Router } from 'express';
import { repoClientes } from '../repos/clientes.js';
import { repoOrcamentos, repoOrcamentoItens, repoTabelaServicos, repoTabelaPacotes } from '../repos/orcamentos.js';
import { repoPlacasModelos, precoSugeridoPlacas } from '../repos/placas.js';
import { obterConfig } from '../repos/config.js';
import { emTransacao } from '../repos/crud.js';
import { calcularTotais, nomeArquivoPdf } from '../domain/orcamentos.js';
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

const invalido = (campo, mensagem) => new ErroValidacao([{ campo, mensagem }]);

export function rotasOrcamentos({ db, hoje }) {
  const r = Router();
  const clientes = repoClientes(db);
  const orcamentos = repoOrcamentos(db);
  const itens = repoOrcamentoItens(db);
  const servicos = repoTabelaServicos(db);
  const pacotes = repoTabelaPacotes(db);
  const modelos = repoPlacasModelos(db);

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

  r.put('/orcamentos/:id', (req, res) => {
    const orcamento = carregar(req.params.id);
    const dados = validar(req.body, REGRAS_ORCAMENTO, { parcial: true });
    res.json(montar(orcamentos.atualizar(orcamento.id, dados)));
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
