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

export function estoqueMaterial(materialId, lotes, vendas, itensModelo) {
  return totalCompradoMaterial(materialId, lotes) - quantidadeConsumidaMaterial(materialId, vendas, itensModelo);
}

export function custoReceitaModelo(modeloId, itensModelo, lotes) {
  const itens = itensModelo.filter((i) => i.modelo_id === modeloId);
  if (!itens.length) return null;
  let total = 0;
  for (const item of itens) {
    const custo = custoAtualMaterial(item.material_id, lotes);
    if (custo === null) return null;
    total += custo * item.quantidade;
  }
  return total;
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

export function materiaisComEstoqueNegativo(materiais, lotes, vendas, itensModelo) {
  return materiais
    .map((m) => ({ ...m, estoque_atual: estoqueMaterial(m.id, lotes, vendas, itensModelo) }))
    .filter((m) => m.estoque_atual < 0);
}
