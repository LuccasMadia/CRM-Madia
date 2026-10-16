import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatarDinheiro } from '../../lib/dinheiro.js';
import { COR_GRADE, COR_TEXTO, ESCALA, EIXO, TOOLTIP, milhares } from './tema.js';

export function GraficoBarras({ dados }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={dados} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={COR_GRADE} vertical={false} />
        <XAxis dataKey="rotulo" {...EIXO} />
        <YAxis {...EIXO} width={44} tickFormatter={milhares} />
        <Tooltip {...TOOLTIP} cursor={{ fill: 'rgb(255 255 255 / 0.04)' }} formatter={(v) => [formatarDinheiro(v), 'Recebido']} />
        <Bar dataKey="valor_centavos" radius={[8, 8, 0, 0]} maxBarSize={64}>
          {dados.map((d, i) => <Cell key={d.rotulo} fill={ESCALA[(i + 1) % ESCALA.length]} />)}
          <LabelList dataKey="valor_centavos" position="top" fill={COR_TEXTO} fontSize={11} formatter={milhares} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
