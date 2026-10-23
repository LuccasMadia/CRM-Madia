import { Link } from 'react-router';
import { Icone } from './Icone.jsx';

// Faixa do topo de cada serviço: só o que pede ação agora, e cada item leva para onde se resolve.
// itens: [{ texto, tom?: 'perigo' | 'atencao', para? }]; null enquanto carrega.
export function PedeAtencao({ itens }) {
  if (!itens) return null;
  return (
    <section className="pede-atencao" aria-label="Pede atenção">
      {itens.length ? itens.map(({ texto, tom, para }) => {
        const classe = `pede-atencao__item${tom ? ` pede-atencao__item--${tom}` : ''}`;
        return para
          ? <Link key={texto} className={classe} to={para}>{texto}</Link>
          : <span key={texto} className={classe}>{texto}</span>;
      }) : <span className="pede-atencao__vazio"><Icone nome="check" tamanho={16} /> Nada pendente por aqui</span>}
    </section>
  );
}
