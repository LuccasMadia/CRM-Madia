import { useState } from 'react';
import { formatarData, hojeISO, nomeMes, semanasDoMes } from '../lib/datas.js';

const DIAS_DA_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function Calendario({ itens, dataDe, renderItem, mesInicial = hojeISO().slice(0, 7) }) {
  const [mes, setMes] = useState(mesInicial);
  const [ano, numeroMes] = mes.split('-').map(Number);
  const hoje = hojeISO();

  const porDia = new Map();
  for (const item of itens) {
    const dia = dataDe(item);
    porDia.set(dia, [...(porDia.get(dia) ?? []), item]);
  }

  function mudar(delta) {
    setMes(new Date(Date.UTC(ano, numeroMes - 1 + delta, 1)).toISOString().slice(0, 7));
  }

  return (
    <div>
      <div className="pagina__topo">
        <button type="button" className="btn" onClick={() => mudar(-1)} aria-label="Mês anterior">‹</button>
        <h2 style={{ margin: 0 }}>{nomeMes(mes)}</h2>
        <button type="button" className="btn" onClick={() => mudar(1)} aria-label="Próximo mês">›</button>
      </div>
      <div className="calendario">
        {DIAS_DA_SEMANA.map((d) => <div key={d} className="calendario__cabecalho">{d}</div>)}
        {semanasDoMes(ano, numeroMes).flat().map((dia) => {
          const classes = ['calendario__dia', !dia.doMes && 'calendario__dia--fora', dia.data === hoje && 'calendario__dia--hoje']
            .filter(Boolean).join(' ');
          return (
            <div key={dia.data} className={classes} role="group" aria-label={formatarData(dia.data)}>
              <span>{Number(dia.data.slice(8))}</span>
              {(porDia.get(dia.data) ?? []).map((item) => <div key={item.id}>{renderItem(item)}</div>)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
