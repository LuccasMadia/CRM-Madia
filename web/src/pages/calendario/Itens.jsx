import { Link } from 'react-router';
import { Icone } from '../../components/Icone.jsx';
import { rotuloHora } from './datasCalendario.js';

// Evento do calendário (abre a edição) e prazo de tarefa/parcela (somente leitura, leva ao item).
export function ChipEvento({ evento, dia, onAbrir }) {
  const hora = rotuloHora(evento, dia);
  const classes = ['agenda__chip', evento.pendente && 'agenda__chip--pendente', evento.recorrente && 'agenda__chip--recorrente'].filter(Boolean).join(' ');
  return (
    <button type="button" className={classes} onClick={() => onAbrir(evento)} title={evento.titulo}>
      {hora === 'Dia inteiro' ? '' : `${hora} `}{evento.titulo}
    </button>
  );
}

const ICONE_PRAZO = { tarefa: 'tarefas', parcela: 'financeiro' };

export function ChipPrazo({ prazo }) {
  return (
    <Link to={prazo.link} className={`agenda__chip agenda__chip--${prazo.tipo}`} title={prazo.titulo}>
      <Icone nome={ICONE_PRAZO[prazo.tipo]} tamanho={12} /> {prazo.titulo}
    </Link>
  );
}
