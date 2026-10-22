import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatarDinheiro } from '../../lib/dinheiro.js';
import { COR_ACUMULADO, COR_CARTAO, COR_EIXO, COR_ENTRADA, COR_GRADE, COR_SAIDA, EIXO, TOOLTIP, milhares } from './tema.js';
import { useValoresOcultos } from '../../lib/privacidade.js';

const NOMES = { receita: 'Faturamento', custo: 'Custos', acumulado: 'Resultado acumulado' };

// dados: [{ rotulo, receita, custo, acumulado }] — acumulado vem null nos meses que ainda não chegaram
export function GraficoFaturamentoCustos({ dados }) {
  const ocultos = useValoresOcultos();
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={dados} margin={{ top: 10, right: 12, left: 0, bottom: 0 }} barGap={2} barCategoryGap="28%">
        <CartesianGrid stroke={COR_GRADE} vertical={false} />
        <XAxis dataKey="rotulo" {...EIXO} />
        <YAxis {...EIXO} width={ocultos ? 8 : 44} tick={!ocultos} tickFormatter={milhares} />
        <ReferenceLine y={0} stroke={COR_EIXO} strokeOpacity={0.5} />
        <Tooltip
          {...TOOLTIP}
          cursor={{ fill: 'rgb(255 255 255 / 0.04)' }}
          formatter={(v, chave) => [formatarDinheiro(v), NOMES[chave]]}
        />
        <Bar dataKey="receita" fill={COR_ENTRADA} radius={[4, 4, 0, 0]} maxBarSize={22} />
        <Bar dataKey="custo" fill={COR_SAIDA} radius={[4, 4, 0, 0]} maxBarSize={22} />
        <Line
          type="linear"
          dataKey="acumulado"
          stroke={COR_ACUMULADO}
          strokeWidth={2}
          dot={{ r: 3, fill: COR_ACUMULADO, stroke: COR_CARTAO, strokeWidth: 2 }}
          activeDot={{ r: 5 }}
          connectNulls={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
