import { Cell, Pie, PieChart, Tooltip } from 'recharts';
import { ESCALA, TOOLTIP } from './tema.js';

const TAMANHO = 160;

export function GraficoRosca({ fatias, total }) {
  const percentual = (q) => `${Math.round((q / total) * 100)}%`;
  return (
    <div className="rosca">
      <div className="rosca__grafico">
        <PieChart width={TAMANHO} height={TAMANHO}>
          <Tooltip {...TOOLTIP} formatter={(v, nome) => [`${v} ${v === 1 ? 'cliente' : 'clientes'}`, nome]} />
          <Pie data={fatias} dataKey="quantidade" nameKey="nome" innerRadius={50} outerRadius={74} paddingAngle={2} stroke="none">
            {fatias.map((f, i) => <Cell key={f.nome} fill={ESCALA[i % ESCALA.length]} />)}
          </Pie>
        </PieChart>
        <div className="rosca__centro">
          <strong>{total}</strong>
          <span>{total === 1 ? 'cliente' : 'clientes'}</span>
        </div>
      </div>
      <ul className="rosca__legenda">
        {fatias.map((f, i) => (
          <li key={f.nome}>
            <span className="rosca__ponto" style={{ background: ESCALA[i % ESCALA.length] }} />
            <span>{f.nome}</span>
            <b>{percentual(f.quantidade)}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
