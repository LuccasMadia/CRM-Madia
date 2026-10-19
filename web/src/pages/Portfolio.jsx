import { useRef, useState } from 'react';

export const URL_PORTFOLIO = 'https://www.luccasmadia.com.br/';

// Mostra o site do portfólio dentro do CRM, para apresentar a clientes sem trocar de janela.
export function Portfolio() {
  const quadro = useRef(null);
  const [versao, setVersao] = useState(0);

  function telaCheia() {
    quadro.current?.requestFullscreen?.();
  }

  return (
    <section className="portfolio">
      <header className="pagina__topo">
        <h1>Portfólio</h1>
        <div className="portfolio__acoes">
          <button type="button" className="btn btn--fantasma" onClick={() => setVersao((v) => v + 1)}>Recarregar</button>
          <button type="button" className="btn" onClick={telaCheia}>Tela cheia</button>
          <a className="btn btn--primario" href={URL_PORTFOLIO} target="_blank" rel="noreferrer">Abrir em nova guia</a>
        </div>
      </header>
      <iframe key={versao} ref={quadro} className="portfolio__site" src={URL_PORTFOLIO} title="Site do portfólio" />
    </section>
  );
}
