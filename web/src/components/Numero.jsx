import { Icone } from './Icone.jsx';

// tom: 'ok' | 'perigo' | 'atencao' pinta o valor; detalhe é uma linha menor embaixo dele
export function Numero({ rotulo, icone, tom, detalhe, children }) {
  const classeTom = tom ? ` cartao-numero--${tom}` : '';
  const textos = (
    <>
      <p className="cartao-numero__rotulo">{rotulo}</p>
      <p className="cartao-numero__valor">{children}</p>
      {detalhe && <p className="cartao-numero__detalhe">{detalhe}</p>}
    </>
  );
  if (!icone) return <div className={`cartao${classeTom}`}>{textos}</div>;
  return (
    <div className={`cartao cartao-numero${classeTom}`}>
      <span className="cartao-numero__icone"><Icone nome={icone} tamanho={22} /></span>
      <div className="cartao-numero__texto">{textos}</div>
    </div>
  );
}
