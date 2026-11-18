import { Link } from 'react-router';
import { Icone } from './Icone.jsx';

// tom: 'ok' | 'perigo' | 'atencao' pinta o valor; detalhe é uma linha menor embaixo dele
// para: quando existe, o cartão inteiro vira link
export function Numero({ rotulo, icone, tom, detalhe, para, children }) {
  const classeTom = tom ? ` cartao-numero--${tom}` : '';
  const Raiz = para ? Link : 'div';
  const extra = para ? { to: para } : {};
  const classeLink = para ? ' cartao-numero--link' : '';
  const textos = (
    <>
      <p className="cartao-numero__rotulo">{rotulo}</p>
      <p className="cartao-numero__valor">{children}</p>
      {detalhe && <p className="cartao-numero__detalhe">{detalhe}</p>}
    </>
  );
  if (!icone) return <Raiz {...extra} className={`cartao${classeTom}${classeLink}`}>{textos}</Raiz>;
  return (
    <Raiz {...extra} className={`cartao cartao-numero${classeTom}${classeLink}`}>
      <span className="cartao-numero__icone"><Icone nome={icone} tamanho={22} /></span>
      <div className="cartao-numero__texto">{textos}</div>
    </Raiz>
  );
}
