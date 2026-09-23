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
