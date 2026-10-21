// Regras puras do orçamento: totais, desconto de combo e nome do PDF.
// Dinheiro sempre em centavos (inteiro).

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

export function nomeArquivoPdf(numero, nomeCliente) {
  const slug = String(nomeCliente ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'cliente';
  return `Orcamento-${String(numero).padStart(3, '0')}-${slug}.pdf`;
}
