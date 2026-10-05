export function apenasAtivos(lista, valorSelecionado) {
  return (lista ?? []).filter((item) => item.ativo || String(item.id) === valorSelecionado);
}
