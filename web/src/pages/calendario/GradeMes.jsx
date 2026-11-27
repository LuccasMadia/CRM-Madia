import { formatarData, semanasDoMes } from '../../lib/datas.js';
import { eventosDoDia } from './datasCalendario.js';
import { ChipEvento, ChipPrazo } from './Itens.jsx';

const DIAS_DA_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function GradeMes({ ancora, hoje, eventos, prazos, cores = {}, onNovo, onAbrir }) {
  const [ano, mes] = ancora.slice(0, 7).split('-').map(Number);
  return (
    <div className="calendario">
      {DIAS_DA_SEMANA.map((d) => <div key={d} className="calendario__cabecalho">{d}</div>)}
      {semanasDoMes(ano, mes).flat().map((dia) => {
        const classes = ['calendario__dia', !dia.doMes && 'calendario__dia--fora', dia.data === hoje && 'calendario__dia--hoje'].filter(Boolean).join(' ');
        return (
          <div key={dia.data} className={classes} role="group" aria-label={formatarData(dia.data)}>
            <button type="button" className="agenda__numero" aria-label={`Novo evento em ${formatarData(dia.data)}`} onClick={() => onNovo(dia.data)}>
              {Number(dia.data.slice(8))}
            </button>
            {eventosDoDia(eventos, dia.data).map((e) => <ChipEvento key={e.id} evento={e} dia={dia.data} cor={cores[e.calendario_href]} onAbrir={onAbrir} />)}
            {prazos.filter((p) => p.dia === dia.data).map((p) => <ChipPrazo key={p.chave} prazo={p} />)}
          </div>
        );
      })}
    </div>
  );
}
