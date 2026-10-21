// No celular as abas ficam numa faixa que rola de lado (.abas, .pilulas): a aba escolhida
// precisa aparecer inteira, e não cortada na borda da tela.
function mostrar(aba) {
  const faixa = aba.parentElement;
  if (!faixa || faixa.scrollWidth <= faixa.clientWidth) return;
  const inicio = aba.offsetLeft - faixa.offsetLeft;
  const fim = inicio + aba.offsetWidth;
  if (inicio < faixa.scrollLeft) faixa.scrollLeft = inicio - 16;
  else if (fim > faixa.scrollLeft + faixa.clientWidth) faixa.scrollLeft = fim - faixa.clientWidth + 16;
}

export function mostrarAbasSelecionadas(raiz = document) {
  raiz.querySelectorAll('[role="tab"][aria-selected="true"]').forEach(mostrar);
}

export function manterAbasVisiveis() {
  const aoClicar = (e) => {
    const aba = e.target.closest?.('[role="tab"]');
    if (aba) mostrar(aba);
  };
  document.addEventListener('click', aoClicar);
  return () => document.removeEventListener('click', aoClicar);
}
