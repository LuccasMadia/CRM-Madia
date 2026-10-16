import { Icone } from './Icone.jsx';

export function Numero({ rotulo, icone, children }) {
  if (!icone) {
    return (
      <div className="cartao">
        <p className="cartao-numero__rotulo">{rotulo}</p>
        <p className="cartao-numero__valor">{children}</p>
      </div>
    );
  }
  return (
    <div className="cartao cartao-numero">
      <span className="cartao-numero__icone"><Icone nome={icone} tamanho={22} /></span>
      <div className="cartao-numero__texto">
        <p className="cartao-numero__rotulo">{rotulo}</p>
        <p className="cartao-numero__valor">{children}</p>
      </div>
    </div>
  );
}
