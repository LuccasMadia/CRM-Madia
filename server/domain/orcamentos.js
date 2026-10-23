// Regras puras do orçamento: totais, desconto de combo e nome do PDF.
// Dinheiro sempre em centavos (inteiro).
import { somarDias, somarMeses } from './datas.js';

const num = (v) => Number(v) || 0;

// Chave do "serviço" para o combo: todas as placas contam como um só.
function chaveServico(it) {
  if (it.tipo_servico === 'placa') return 'placa';
  if (it.servico_id != null) return 's' + it.servico_id;
  return 'i' + it.id;
}

export function calcularTotais(itens, descontoPct) {
  const lista = itens || [];
  const comUnico = lista.filter((it) => num(it.valor_unico_centavos) > 0);
  const servicos_combo = new Set(comUnico.map(chaveServico)).size;
  const subtotal_unico_centavos = comUnico.reduce((s, it) => s + num(it.valor_unico_centavos), 0);

  const desconto_centavos = servicos_combo >= 2 && descontoPct != null
    ? Math.round((subtotal_unico_centavos * num(descontoPct)) / 100)
    : 0;

  const mensalidades = lista
    .filter((it) => num(it.valor_mensal_centavos) > 0)
    .map((it) => ({ nome: it.nome, valor_centavos: num(it.valor_mensal_centavos) }));

  return {
    servicos_combo,
    subtotal_unico_centavos,
    desconto_centavos,
    total_unico_centavos: subtotal_unico_centavos - desconto_centavos,
    mensalidades,
    total_mensal_centavos: mensalidades.reduce((s, m) => s + m.valor_centavos, 0),
  };
}

// ---- Aceite: o que cada item vira (as funções abaixo são usadas também pela tela de conferência) ----

// site: projeto no funil · gmn: projeto do Google Meu Negócio · placa: venda de placa a receber ·
// mensal_site / mensal_gmn: mensalidade no projeto de site ou de GMN gerado · nenhum: não cria nada.
export const DESTINOS = ['site', 'gmn', 'placa', 'mensal_site', 'mensal_gmn', 'nenhum'];

export function destinosDoItem(it) {
  if (it.tipo_servico === 'placa') return ['placa', 'nenhum'];
  if (it.tipo_servico === 'gmn_config') return ['gmn', 'nenhum'];
  if (it.tipo_servico === 'hospedagem') return ['mensal_site', 'nenhum'];
  // Só mensal (gestão do GMN da tabela ou item livre): o Lucca escolhe em qual projeto a mensalidade entra.
  if (num(it.valor_unico_centavos) === 0 && num(it.valor_mensal_centavos) > 0) return ['mensal_gmn', 'mensal_site', 'nenhum'];
  return ['site', 'nenhum'];
}

export function destinoPadrao(it) {
  const unico = num(it.valor_unico_centavos) > 0;
  const mensal = num(it.valor_mensal_centavos) > 0;
  if (!unico && !mensal) return 'nenhum';
  // Item livre só mensal costuma ser manutenção do site; o da tabela é a gestão do GMN.
  if (!unico && it.tipo_servico === 'comum') return 'mensal_gmn';
  if (!unico && it.tipo_servico == null) return 'mensal_site';
  return destinosDoItem(it)[0];
}

// ---- Vincular a um projeto que já existe (em vez de criar um novo) ----

// Só site e GMN viram projeto; cada um só pode usar projeto do mesmo serviço.
export const SERVICO_DO_DESTINO = { site: 'site_sistema', gmn: 'google_meu_negocio' };
// Etapa de um projeto criado pelo aceite: site em Valor definido, GMN pendente.
export const ETAPA_DO_DESTINO = { site: 'valor_definido', gmn: 'andamento' };
const ORDEM_ETAPAS = ['ideia', 'prototipo', 'apresentado', 'valor_definido', 'teste', 'andamento', 'entregue'];

// O projeto vinculado só avança até a etapa do aceite: o que já passou dela fica onde está.
export function etapaAoVincular(etapaAtual, destino) {
  const alvo = ETAPA_DO_DESTINO[destino];
  const atual = ORDEM_ETAPAS.indexOf(etapaAtual);
  return atual >= 0 && atual < ORDEM_ETAPAS.indexOf(alvo) ? alvo : etapaAtual;
}

// Por que um projeto não pode ser vinculado a este item; null quando pode.
export function motivoNaoVincula(projeto, { destino, clienteId }) {
  if (!SERVICO_DO_DESTINO[destino]) return 'só site e Google Meu Negócio podem usar um projeto existente';
  if (!projeto) return 'o projeto escolhido não existe';
  if (projeto.cliente_id !== clienteId) return `"${projeto.titulo}" é de outro cliente`;
  if (projeto.servico !== SERVICO_DO_DESTINO[destino]) return `"${projeto.titulo}" é de outro serviço`;
  if (projeto.etapa === 'perdido') return `"${projeto.titulo}" está perdido`;
  if (projeto.ficticio) return `"${projeto.titulo}" é fictício`;
  if (projeto.orcamento_id != null) return `"${projeto.titulo}" já está ligado a um orçamento`;
  return null;
}

// Placa é gravada como preço por placa: o valor da linha precisa ser múltiplo da quantidade.
const divisorDoItem = (it) => (it.tipo_servico === 'placa' ? Math.max(1, num(it.quantidade)) : 1);

// Divide o desconto do combo proporcionalmente entre os itens pagos uma vez. A soma bate com o total do
// orçamento: o resto dos centavos vai para o maior item que aceita centavos (placa só aceita múltiplos da
// quantidade). Devolve { [item.id]: centavos }.
export function valoresComDesconto(itens, descontoCentavos) {
  const comUnico = (itens || []).filter((it) => num(it.valor_unico_centavos) > 0);
  const subtotal = comUnico.reduce((s, it) => s + num(it.valor_unico_centavos), 0);
  const desconto = num(descontoCentavos);
  const valores = {};
  for (const it of comUnico) {
    const bruto = num(it.valor_unico_centavos) - (subtotal ? Math.round((desconto * num(it.valor_unico_centavos)) / subtotal) : 0);
    const d = divisorDoItem(it);
    valores[it.id] = Math.round(bruto / d) * d;
  }
  const resto = subtotal - desconto - Object.values(valores).reduce((s, v) => s + v, 0);
  if (resto && comUnico.length) {
    const porValor = [...comUnico].sort((a, b) => num(b.valor_unico_centavos) - num(a.valor_unico_centavos));
    const alvo = porValor.find((it) => divisorDoItem(it) === 1) ?? porValor[0];
    const d = divisorDoItem(alvo);
    valores[alvo.id] += Math.round(resto / d) * d;
  }
  return valores;
}

export const MODOS_PARCELAS = ['nenhuma', 'avista', 'entrada_entrega', 'mensais'];

// Parcelas de um projeto gerado. Os centavos que sobram da divisão vão na última.
// A parcela "na entrega" não tem data certa: fica um mês depois da entrada, e o Lucca ajusta no projeto.
export function planejarParcelas(valorCentavos, { modo, quantidade, primeira }) {
  const valor = num(valorCentavos);
  if (valor <= 0 || modo === 'nenhuma') return [];
  if (modo === 'avista') return [{ descricao: 'À vista', valor_centavos: valor, vencimento: primeira }];
  if (modo === 'entrada_entrega') {
    const entrada = Math.floor(valor / 2);
    return [
      { descricao: 'Entrada (50%)', valor_centavos: entrada, vencimento: primeira },
      { descricao: 'Na entrega (50%)', valor_centavos: valor - entrada, vencimento: somarMeses(primeira, 1) },
    ];
  }
  const n = Math.max(1, num(quantidade));
  const base = Math.floor(valor / n);
  return Array.from({ length: n }, (_, i) => ({
    descricao: `Parcela ${i + 1}/${n}`,
    valor_centavos: i === n - 1 ? valor - base * (n - 1) : base,
    vencimento: somarMeses(primeira, i),
  }));
}

// Atalho de parcelas a partir do texto "Forma de pagamento" do orçamento.
export function sugerirParcelas(pagamento) {
  const texto = String(pagamento ?? '').toLowerCase();
  if (/vista/.test(texto)) return { modo: 'avista', quantidade: 2 };
  if (/50\s*%/.test(texto)) return { modo: 'entrada_entrega', quantidade: 2 };
  const vezes = texto.match(/(\d+)\s*x/);
  if (vezes && Number(vezes[1]) >= 2) return { modo: 'mensais', quantidade: Number(vezes[1]) };
  return { modo: 'avista', quantidade: 2 };
}

const DIAS_SEM_RESPOSTA = 7;
const DIAS_PARADO = 7;
const DIAS_AVISO_VENCER = 3;
const diasEntre = (de, ate) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86400000);

// O que pede atenção num orçamento. "Enviado" conta da data do orçamento (é a data que vai no PDF);
// rascunho parado conta da última mudança nele ou nos itens (`mexido_em`, AAAA-MM-DD).
export function alertasOrcamento(o, hoje) {
  const vence_em = somarDias(o.data, num(o.validade_dias));
  const dias_para_vencer = diasEntre(hoje, vence_em);
  const enviado = o.situacao === 'enviado';
  return {
    vence_em,
    dias_para_vencer,
    sem_resposta: enviado && diasEntre(o.data, hoje) > DIAS_SEM_RESPOSTA,
    vencendo: enviado && dias_para_vencer <= DIAS_AVISO_VENCER,
    parado: o.situacao === 'rascunho' && diasEntre(o.mexido_em ?? o.data, hoje) > DIAS_PARADO,
  };
}

export function nomeArquivoPdf(numero, nomeCliente) {
  const slug = String(nomeCliente ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'cliente';
  return `Orcamento-${String(numero).padStart(3, '0')}-${slug}.pdf`;
}
