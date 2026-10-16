// Cores dos gráficos: espelham os tokens de styles.css (--t1…--t5, --borda, --texto-suave,
// --texto, --superficie, --superficie-2). Ficam em hex porque o Recharts recebe cor como atributo SVG.
export const ESCALA = ['#5eead4', '#2dd4bf', '#14b8a6', '#0d9488', '#0f766e'];
export const COR_GRADE = '#24262a';
export const COR_EIXO = '#8b9099';
export const COR_TEXTO = '#ececee';
export const COR_CARTAO = '#141517';

export const TOOLTIP = {
  contentStyle: { background: '#1c1e21', border: `1px solid ${COR_GRADE}`, borderRadius: 10, color: COR_TEXTO },
  itemStyle: { color: COR_TEXTO },
  labelStyle: { color: COR_EIXO },
};

export const EIXO = { stroke: COR_EIXO, fontSize: 11, tickLine: false, axisLine: false };

// 1234500 centavos → "12,3k"; abaixo de mil reais, o valor inteiro.
export function milhares(centavos) {
  const reais = centavos / 100;
  if (reais < 1000) return String(Math.round(reais));
  return `${(reais / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`;
}
