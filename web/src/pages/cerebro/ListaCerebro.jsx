const acaoDoPonto = (ponto, area) => ({ tipo: 'ponto', dados: { ...ponto, area: area.rotulo } });

// Lista de botões de verdade (alternativa ao canvas para teclado e leitor de tela): um bloco por área, histórico recolhido.
export function ListaCerebro({ dados, aoEscolher }) {
  const itens = (lista, tipo, rotulo) => lista.map((item) => (
    <li key={`${tipo}:${item.id}`}><button type="button" onClick={() => aoEscolher({ tipo, dados: item }, tipo === 'app' ? `app:${item.id}` : null)}>{rotulo(item)}</button></li>
  ));
  const ponto = (area) => (p) => (
    <li key={p.id}><button type="button" onClick={() => aoEscolher(acaoDoPonto(p, area), p.id)}>{p.rotulo}</button></li>
  );
  return (
    <div className="cerebro-lista" aria-label="Lista do cérebro" role="region">
      <section>
        <h2>Cérebro</h2>
        <ul>
          {dados.centro && <li><button type="button" onClick={() => aoEscolher({ tipo: 'centro', dados: dados.centro }, null)}>CLAUDE.md</button></li>}
          {itens(dados.skills, 'skill', (s) => s.nome)}
          {itens(dados.rotinas, 'rotina', (r) => r.nome)}
          {itens(dados.apps, 'app', (a) => a.nome)}
        </ul>
      </section>
      {dados.memoria.areas.map((area) => {
        const vivos = area.pontos.filter((p) => p.vivo !== false);
        const historico = area.pontos.filter((p) => p.vivo === false);
        return (
          <section key={area.id}>
            <h2>{area.rotulo}</h2>
            <ul>{vivos.map(ponto(area))}</ul>
            {historico.length > 0 && (
              <details>
                <summary>Histórico ({historico.length})</summary>
                <ul>{historico.map(ponto(area))}</ul>
              </details>
            )}
          </section>
        );
      })}
    </div>
  );
}
