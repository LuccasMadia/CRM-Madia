import { formatarData } from '../../lib/datas.js';
import { diasDaSemana, eventosDoDia } from './datasCalendario.js';
import { ChipEvento, ChipPrazo } from './Itens.jsx';

const NOMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function GradeSemana({ ancora, hoje, eventos, prazos, onNovo, onAbrir }) {
  return (
    <div className="agenda__semana">
      {diasDaSemana(ancora).map((dia, i) => (
        <div key={dia} className={`agenda__coluna${dia === hoje ? ' agenda__coluna--hoje' : ''}`} role="group" aria-label={formatarData(dia)}>
          <button type="button" className="agenda__numero" aria-label={`Novo evento em ${formatarData(dia)}`} onClick={() => onNovo(dia)}>
            {NOMES[i]} {Number(dia.slice(8))}
          </button>
          {eventosDoDia(eventos, dia).map((e) => <ChipEvento key={e.id} evento={e} dia={dia} onAbrir={onAbrir} />)}
          {prazos.filter((p) => p.dia === dia).map((p) => <ChipPrazo key={p.chave} prazo={p} />)}
        </div>
      ))}
    </div>
  );
}
