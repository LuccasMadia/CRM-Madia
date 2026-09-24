export function hojeLocal(data = new Date()) {
  return data.toLocaleDateString('sv-SE'); // sv-SE formata como YYYY-MM-DD no fuso local
}

export function somarDias(iso, dias) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function ultimoDiaDoMes(ano, mesIndex0) {
  return new Date(Date.UTC(ano, mesIndex0 + 1, 0)).getUTCDate();
}

export function somarMeses(iso, meses) {
  const [ano, mes, dia] = iso.split('-').map(Number);
  const alvo = new Date(Date.UTC(ano, mes - 1 + meses, 1));
  alvo.setUTCDate(Math.min(dia, ultimoDiaDoMes(alvo.getUTCFullYear(), alvo.getUTCMonth())));
  return alvo.toISOString().slice(0, 10);
}

export function dataNoMes(anoMes, dia) {
  const [ano, mes] = anoMes.split('-').map(Number);
  const diaFinal = Math.min(dia, ultimoDiaDoMes(ano, mes - 1));
  return `${anoMes}-${String(diaFinal).padStart(2, '0')}`;
}

export const mesDe = (iso) => iso.slice(0, 7);

export function dataValida(texto) {
  if (typeof texto !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const d = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto;
}
