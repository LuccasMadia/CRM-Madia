import { createElement } from 'react';

// O jsdom não mede tamanho, então o Recharts real não desenha nada nos testes.
// Uso: vi.mock('recharts', async () => (await import('<caminho>/test/mockRecharts.js')).rechartsFalso);
const Caixa = ({ children }) => createElement('div', null, children);
const Nada = () => null;

export const rechartsFalso = {
  ResponsiveContainer: Caixa,
  AreaChart: Caixa,
  BarChart: Caixa,
  ComposedChart: Caixa,
  PieChart: Caixa,
  Pie: Caixa,
  Bar: Caixa,
  Area: Nada,
  Line: Nada,
  ReferenceLine: Nada,
  Cell: Nada,
  CartesianGrid: Nada,
  XAxis: Nada,
  YAxis: Nada,
  Tooltip: Nada,
  LabelList: Nada,
};
