export function custoUnitarioLote(lote) {
  return Math.round((lote.valor_kit_centavos + lote.valor_frete_centavos) / lote.quantidade);
}

export function custoAtualMaterial(materialId, lotes) {
  const doMaterial = lotes.filter((l) => l.material_id === materialId);
  if (!doMaterial.length) return null;
  const maisRecente = doMaterial.reduce((a, b) => {
    if (a.data_compra !== b.data_compra) return a.data_compra > b.data_compra ? a : b;
    return a.id > b.id ? a : b;
  });
  return custoUnitarioLote(maisRecente);
}

export function totalCompradoMaterial(materialId, lotes) {
  return lotes.filter((l) => l.material_id === materialId).reduce((soma, l) => soma + l.quantidade, 0);
}

export function quantidadeConsumidaMaterial(materialId, vendas, itensModelo) {
  return vendas.reduce((soma, venda) => {
    const porUnidade = itensModelo
      .filter((i) => i.modelo_id === venda.modelo_id && i.material_id === materialId)
      .reduce((s, i) => s + i.quantidade, 0);
    return soma + porUnidade * venda.quantidade;
  }, 0);
}

export function quantidadeConsumidaAvariaMaterial(materialId, avarias, itensAvaria) {
  return avarias.reduce((soma, avaria) => {
    const porUnidade = itensAvaria
      .filter((i) => i.avaria_id === avaria.id && i.material_id === materialId)
      .reduce((s, i) => s + i.quantidade, 0);
    return soma + porUnidade * avaria.quantidade;
  }, 0);
}

export function estoqueMaterial(materialId, lotes, vendas, itensModelo, avarias = [], itensAvaria = []) {
  return totalCompradoMaterial(materialId, lotes)
    - quantidadeConsumidaMaterial(materialId, vendas, itensModelo)
    - quantidadeConsumidaAvariaMaterial(materialId, avarias, itensAvaria);
}

export function custoItensAvaria(itens, lotes) {
  if (!itens.length) return null;
  let total = 0;
  for (const item of itens) {
    const custo = custoAtualMaterial(item.material_id, lotes);
    if (custo === null) return null;
    total += custo * item.quantidade;
  }
  return total;
}

export function custoReceitaModelo(modeloId, itensModelo, lotes) {
  const itens = itensModelo.filter((i) => i.modelo_id === modeloId);
  return custoItensAvaria(itens, lotes);
}

export function lucroPrevisto(modelo, custoReceitaCentavos) {
  if (custoReceitaCentavos === null) return null;
  return modelo.preco_venda_centavos - custoReceitaCentavos;
}

export function lucroRealVenda(venda) {
  return (venda.preco_vendido_centavos - venda.custo_unitario_centavos) * venda.quantidade;
}

export function resumoLucroReal(vendas) {
  const porModelo = new Map();
  for (const venda of vendas) {
    const atual = porModelo.get(venda.modelo_id) ?? { modelo_id: venda.modelo_id, quantidade: 0, lucro_total_centavos: 0 };
    atual.quantidade += venda.quantidade;
    atual.lucro_total_centavos += lucroRealVenda(venda);
    porModelo.set(venda.modelo_id, atual);
  }
  return [...porModelo.values()].map((r) => ({ ...r, lucro_medio_centavos: Math.round(r.lucro_total_centavos / r.quantidade) }));
}

export function materiaisComEstoqueNegativo(materiais, lotes, vendas, itensModelo, avarias = [], itensAvaria = []) {
  return materiais
    .map((m) => ({ ...m, estoque_atual: estoqueMaterial(m.id, lotes, vendas, itensModelo, avarias, itensAvaria) }))
    .filter((m) => m.estoque_atual < 0);
}

export function resumoPrejuizoAvarias(avarias, modelos) {
  const porModelo = new Map();
  for (const avaria of avarias) {
    const atual = porModelo.get(avaria.modelo_id) ?? { modelo_id: avaria.modelo_id, quantidade: 0, total_centavos: 0 };
    atual.quantidade += avaria.quantidade;
    atual.total_centavos += avaria.custo_unitario_centavos * avaria.quantidade;
    porModelo.set(avaria.modelo_id, atual);
  }
  const porModeloComNome = [...porModelo.values()].map((r) => ({
    ...r,
    modelo_nome: modelos.find((m) => m.id === r.modelo_id)?.nome ?? '—',
  }));
  return {
    total_centavos: porModeloComNome.reduce((soma, r) => soma + r.total_centavos, 0),
    por_modelo: porModeloComNome,
  };
}

export function calcularCustoUnitarioModelo(modeloId, itensModelo, lotes) {
  const itens = itensModelo.filter((i) => i.modelo_id === modeloId);
  if (!itens.length) return { erro: 'sem_receita' };
  let custoUnitarioCentavos = 0;
  for (const item of itens) {
    const custo = custoAtualMaterial(item.material_id, lotes);
    if (custo === null) return { erro: 'sem_lote' };
    custoUnitarioCentavos += custo * item.quantidade;
  }
  return { custoUnitarioCentavos };
}

export function precosPorPosicao(modelo, packs) {
  const totais = [{ quantidade: 1, preco_total_centavos: modelo.preco_venda_centavos }, ...packs.filter((p) => p.quantidade >= 2)]
    .sort((a, b) => a.quantidade - b.quantidade);
  const degraus = [];
  let anterior = { quantidade: 0, preco_total_centavos: 0 };
  for (const pack of totais) {
    const posicoes = pack.quantidade - anterior.quantidade;
    const diferenca = pack.preco_total_centavos - anterior.preco_total_centavos;
    const base = Math.floor(diferenca / posicoes);
    for (let i = 0; i < posicoes; i++) degraus.push(i === posicoes - 1 ? diferenca - base * (posicoes - 1) : base);
    anterior = pack;
  }
  return degraus;
}

export function precoPlacas(modelo, packs, jaComprou, quantidade) {
  const degraus = precosPorPosicao(modelo, packs);
  const precoPorPlaca = [];
  for (let posicao = jaComprou + 1; posicao <= jaComprou + quantidade; posicao++) {
    precoPorPlaca.push(degraus[Math.min(posicao, degraus.length) - 1]);
  }
  return { total_centavos: precoPorPlaca.reduce((soma, p) => soma + p, 0), preco_por_placa_centavos: precoPorPlaca };
}
