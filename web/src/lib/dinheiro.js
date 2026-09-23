const formato = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export const formatarDinheiro = (centavos) => formato.format((centavos ?? 0) / 100);

export function paraCentavos(texto) {
  let s = String(texto ?? '').replace(/R\$/g, '').replace(/\s/g, '');
  if (!s) return null;
  // "1500.5" sem vírgula: o ponto é separador decimal.
  if (!s.includes(',') && /^\d+\.\d{1,2}$/.test(s)) s = s.replace('.', ',');
  s = s.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
  return Math.round(Number(s) * 100);
}

export const centavosParaTexto = (centavos) => (centavos == null ? '' : (centavos / 100).toFixed(2).replace('.', ','));
