// Grade espacial: cada célula guarda os itens que caem nela.
export function criarGrade(itens, celula = 16) {
  const celulas = new Map();
  for (const it of itens) {
    const chave = `${Math.floor(it.x / celula)},${Math.floor(it.y / celula)}`;
    (celulas.get(chave) ?? celulas.set(chave, []).get(chave)).push(it);
  }
  return { celula, celulas };
}

export function maisProximo({ celula, celulas }, { x, y }, raioMundo) {
  let melhor = null;
  let dMelhor = raioMundo * raioMundo;
  const cx0 = Math.floor((x - raioMundo) / celula), cx1 = Math.floor((x + raioMundo) / celula);
  const cy0 = Math.floor((y - raioMundo) / celula), cy1 = Math.floor((y + raioMundo) / celula);
  for (let cx = cx0; cx <= cx1; cx++) {
    for (let cy = cy0; cy <= cy1; cy++) {
      for (const it of celulas.get(`${cx},${cy}`) ?? []) {
        const d = (it.x - x) ** 2 + (it.y - y) ** 2;
        if (d <= dMelhor) { dMelhor = d; melhor = it.id; }
      }
    }
  }
  return melhor;
}
