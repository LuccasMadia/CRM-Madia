export function Numero({ rotulo, children }) {
  return (
    <div className="cartao">
      <p className="cartao-numero__rotulo">{rotulo}</p>
      <p className="cartao-numero__valor">{children}</p>
    </div>
  );
}
