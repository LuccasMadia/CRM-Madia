const esc = (t) => String(t ?? '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
// shortcut: dobra por caracteres, não por bytes; acentos em linha muito longa podem passar de 75 bytes (clientes toleram).
const dobrar = (l) => l.replace(/(.{70})(?=.)/g, '$1\r\n ');
const dia = (iso) => iso.replaceAll('-', '');
const diaSeguinte = (iso) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

// eventos: [{ uid, data: 'AAAA-MM-DD', titulo, descricao? }] — todos de dia inteiro.
export function gerarIcs(eventos, nome = 'CRM Madia') {
  const linhas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CRM Madia//Agenda//PT-BR', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc(nome)}`, 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'];
  for (const e of eventos) {
    linhas.push('BEGIN:VEVENT', `UID:${e.uid}@crm-madia`, `DTSTAMP:${dia(e.data)}T000000Z`, `DTSTART;VALUE=DATE:${dia(e.data)}`, `DTEND;VALUE=DATE:${dia(diaSeguinte(e.data))}`, `SUMMARY:${esc(e.titulo)}`);
    if (e.descricao) linhas.push(`DESCRIPTION:${esc(e.descricao)}`);
    linhas.push('END:VEVENT');
  }
  linhas.push('END:VCALENDAR');
  return `${linhas.map(dobrar).join('\r\n')}\r\n`;
}
