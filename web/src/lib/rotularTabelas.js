// No celular cada linha de tabela vira um cartão (ver .tabela no styles.css) e cada célula
// mostra o nome da sua coluna ao lado do valor. Esse nome vem do cabeçalho: aqui ele é copiado
// para data-rotulo em toda célula, inclusive nas linhas que aparecem depois.
function rotular(tabela) {
  const titulos = [...tabela.querySelectorAll(':scope > thead th')].map((th) => th.textContent.trim());
  if (!titulos.length) return;
  for (const linha of tabela.querySelectorAll(':scope > tbody > tr')) {
    let coluna = 0;
    for (const celula of linha.children) {
      const rotulo = titulos[coluna] ?? '';
      if (celula.dataset.rotulo !== rotulo) celula.dataset.rotulo = rotulo;
      coluna += celula.colSpan || 1;
    }
  }
}

export function rotularTabelas(raiz = document.body) {
  let agendado = false;
  const tudo = () => {
    agendado = false;
    raiz.querySelectorAll('table.tabela').forEach(rotular);
  };
  tudo();
  // só observa nós entrando e saindo (não atributos), então gravar data-rotulo não dispara de novo
  const observador = new MutationObserver(() => {
    if (agendado) return;
    agendado = true;
    requestAnimationFrame(tudo);
  });
  observador.observe(raiz, { childList: true, subtree: true });
  return () => observador.disconnect();
}
