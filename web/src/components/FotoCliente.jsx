const LIGACOES = new Set(['da', 'de', 'do', 'das', 'dos', 'e', '&']);

// Foto do cliente; sem foto, as iniciais da empresa (ou do responsável) num círculo.
// "Padaria da Ana" vira PA: palavras de ligação não contam.
export function iniciais(nome = '') {
  const palavras = nome.trim().split(/\s+/).filter((p) => p && !LIGACOES.has(p.toLowerCase()));
  return palavras.slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';
}

export function FotoCliente({ cliente, tamanho = 36, rotulo }) {
  const estilo = { width: tamanho, height: tamanho, fontSize: tamanho * 0.38 };
  if (cliente.foto) {
    // Sem rótulo a foto é decorativa (o nome já aparece ao lado).
    return <img className="foto-cliente" src={`/uploads/${cliente.foto}`} alt={rotulo ?? ''} style={estilo} />;
  }
  return <span className="foto-cliente foto-cliente--iniciais" aria-hidden="true" style={estilo}>{iniciais(cliente.nome || cliente.responsavel || '')}</span>;
}
