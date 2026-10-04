export function agruparLotesPorNome(lotes) {
  const porNome = new Map();
  const soltos = [];
  for (const loteItem of lotes) {
    const nome = loteItem.nome_lote ?? '';
    if (nome.trim() === '') {
      soltos.push(loteItem);
      continue;
    }
    if (!porNome.has(nome)) porNome.set(nome, []);
    porNome.get(nome).push(loteItem);
  }

  const grupos = [...porNome.entries()].map(([nomeLote, itens]) => {
    const itensOrdenados = [...itens].sort((a, b) => a.data_compra.localeCompare(b.data_compra));
    const datas = itensOrdenados.map((i) => i.data_compra);
    const totalCentavos = itens.reduce((soma, i) => soma + i.valor_kit_centavos + i.valor_frete_centavos, 0);
    return {
      tipo: 'grupo',
      nomeLote,
      itens: itensOrdenados,
      dataMin: datas[0],
      dataMax: datas[datas.length - 1],
      totalCentavos,
    };
  });

  const entradasSoltas = soltos.map((loteItem) => ({ tipo: 'solto', lote: loteItem }));

  const dataOrdenacao = (entrada) => (entrada.tipo === 'grupo' ? entrada.dataMax : entrada.lote.data_compra);
  return [...grupos, ...entradasSoltas].sort((a, b) => dataOrdenacao(b).localeCompare(dataOrdenacao(a)));
}

export function nomesLoteDistintos(lotes) {
  const nomes = new Set();
  for (const loteItem of lotes) {
    const nome = loteItem.nome_lote ?? '';
    if (nome.trim() !== '') nomes.add(nome);
  }
  return [...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
