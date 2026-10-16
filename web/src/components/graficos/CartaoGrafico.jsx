export function CartaoGrafico({ titulo, subtitulo, vazio = false, children }) {
  return (
    <section className="cartao cartao-grafico">
      <header className="cartao-grafico__topo">
        <h2>{titulo}</h2>
        {subtitulo && <span className="cartao-grafico__sub">{subtitulo}</span>}
      </header>
      {vazio ? <p className="vazio">Ainda sem dados</p> : children}
    </section>
  );
}
