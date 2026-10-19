export const hojeISO = () => new Date().toLocaleDateString('sv-SE');

export function formatarData(iso) {
  if (!iso) return '—';
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

export function nomeMes(anoMes) {
  const [ano, mes] = anoMes.split('-').map(Number);
  return new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

export function semanasDoMes(ano, mes) {
  const cursor = new Date(Date.UTC(ano, mes - 1, 1));
  cursor.setUTCDate(1 - cursor.getUTCDay()); // volta até o domingo
  const semanas = [];
  do {
    const semana = [];
    for (let i = 0; i < 7; i++) {
      semana.push({ data: cursor.toISOString().slice(0, 10), doMes: cursor.getUTCMonth() === mes - 1 });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    semanas.push(semana);
  } while (cursor.getUTCMonth() === mes - 1);
  return semanas;
}

// Dia (AAAA-MM-DD) no fuso local de um instante ISO — publicado_em vem em UTC.
export const diaLocal = (iso) => new Date(iso).toLocaleDateString('sv-SE');

// Valor de <input type="datetime-local"> (fuso local) -> instante ISO em UTC.
export const localParaIso = (valor) => new Date(valor).toISOString();

// Instante ISO -> valor de <input type="datetime-local"> (AAAA-MM-DDTHH:mm no fuso local).
export function isoParaLocal(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function diasDesde(iso, hoje = hojeISO()) {
  return Math.round((Date.parse(`${hoje}T00:00:00Z`) - Date.parse(`${iso}T00:00:00Z`)) / 86400000);
}
