import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatarDinheiro } from '../../lib/dinheiro.js';
import { COR_CARTAO, COR_GRADE, ESCALA, EIXO, TOOLTIP, milhares } from './tema.js';
import { useValoresOcultos } from '../../lib/privacidade.js';

export function GraficoLinha({ dados }) {
  const ocultos = useValoresOcultos();
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={dados} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="grafico-linha-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={ESCALA[1]} stopOpacity={0.35} />
            <stop offset="1" stopColor={ESCALA[1]} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={COR_GRADE} vertical={false} />
        <XAxis dataKey="rotulo" {...EIXO} />
        <YAxis {...EIXO} width={ocultos ? 8 : 44} tick={!ocultos} tickFormatter={milhares} />
        <Tooltip {...TOOLTIP} formatter={(v) => [formatarDinheiro(v), 'Recebido']} />
        <Area
          type="monotone"
          dataKey="valor_centavos"
          stroke={ESCALA[1]}
          strokeWidth={2.5}
          fill="url(#grafico-linha-area)"
          dot={{ r: 4, fill: ESCALA[3], stroke: COR_CARTAO, strokeWidth: 2 }}
          activeDot={{ r: 6 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
