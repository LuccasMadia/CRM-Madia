import { describe, it, expect } from 'vitest';
import { eventoParaIcs, icsParaEventos } from './ics-evento.js';

const base = { uid: 'u1@crm-madia', titulo: 'Reunião', inicio: '2026-10-05T14:00', fim: '2026-10-05T15:00', dia_inteiro: 0, local: 'Sala 2', notas: 'Levar proposta' };
const ida = (e) => icsParaEventos(eventoParaIcs(e));
const ics = (...linhas) => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...linhas, 'END:VCALENDAR'].join('\r\n') + '\r\n';
const vevento = (...linhas) => ics('BEGIN:VEVENT', 'UID:x1', ...linhas, 'END:VEVENT');

describe('eventoParaIcs', () => {
  it('gera horário em São Paulo, com CRLF e as propriedades do evento', () => {
    const texto = eventoParaIcs(base);
    expect(texto).toContain('BEGIN:VCALENDAR\r\n');
    expect(texto).toContain('UID:u1@crm-madia\r\n');
    expect(texto).toContain('DTSTART;TZID=America/Sao_Paulo:20261005T140000\r\n');
    expect(texto).toContain('DTEND;TZID=America/Sao_Paulo:20261005T150000\r\n');
    expect(texto).toContain('SUMMARY:Reunião\r\n');
    expect(texto).toContain('LOCATION:Sala 2\r\n');
    expect(texto).toContain('DESCRIPTION:Levar proposta\r\n');
    expect(texto).toMatch(/DTSTAMP:\d{8}T\d{6}Z\r\n/);
    expect(texto).toContain('BEGIN:VTIMEZONE');
  });

  it('dia inteiro usa VALUE=DATE com fim exclusivo', () => {
    const texto = eventoParaIcs({ ...base, dia_inteiro: 1, inicio: '2026-10-05', fim: '2026-10-07' });
    expect(texto).toContain('DTSTART;VALUE=DATE:20261005\r\n');
    expect(texto).toContain('DTEND;VALUE=DATE:20261008\r\n');
    expect(texto).not.toContain('VTIMEZONE');
    expect(eventoParaIcs({ ...base, dia_inteiro: 1, inicio: '2026-12-31', fim: null })).toContain('DTEND;VALUE=DATE:20270101\r\n');
  });

  it('sem fim e sem local/notas não escreve DTEND, LOCATION nem DESCRIPTION', () => {
    const texto = eventoParaIcs({ ...base, fim: null, local: null, notas: '' });
    expect(texto).not.toMatch(/DTEND|LOCATION|DESCRIPTION/);
  });

  it('nenhuma linha passa de 75 bytes, nem com acentos', () => {
    const texto = eventoParaIcs({ ...base, titulo: 'Reunião sobre a atualização do cadastro ção '.repeat(6) });
    for (const linha of texto.split('\r\n')) expect(Buffer.byteLength(linha)).toBeLessThanOrEqual(75);
  });
});

describe('ida e volta', () => {
  it('evento comum volta idêntico', () => {
    expect(ida(base)).toEqual([{ ...base, recorrente: 0 }]);
  });

  it('dia inteiro de um dia e de vários dias voltam idênticos', () => {
    const um = { ...base, dia_inteiro: 1, inicio: '2026-10-05', fim: null };
    expect(ida(um)).toEqual([{ ...um, recorrente: 0 }]);
    const varios = { ...um, fim: '2026-10-07' };
    expect(ida(varios)).toEqual([{ ...varios, recorrente: 0 }]);
  });

  it('título com ; , \\ e quebra de linha sai escapado e volta igual', () => {
    const e = { ...base, titulo: 'A; B, C \\ D\nlinha 2', notas: 'x;y,z\r\nw' };
    expect(eventoParaIcs(e)).toContain('SUMMARY:A\\; B\\, C \\\\ D\\nlinha 2\r\n');
    const [volta] = ida(e);
    expect(volta.titulo).toBe('A; B, C \\ D\nlinha 2');
    expect(volta.notas).toBe('x;y,z\nw');
  });

  it('título de 200 caracteres (com acentos) é dobrado e volta igual', () => {
    const titulo = 'Açãõ é úmida '.repeat(16).slice(0, 200);
    expect(titulo).toHaveLength(200);
    expect(ida({ ...base, titulo })[0].titulo).toBe(titulo);
  });

  it('evento que cruza a meia-noite mantém início e fim', () => {
    const e = { ...base, inicio: '2026-10-05T23:00', fim: '2026-10-06T01:00' };
    expect(ida(e)[0]).toMatchObject({ inicio: '2026-10-05T23:00', fim: '2026-10-06T01:00' });
  });
});

describe('icsParaEventos', () => {
  it('converte UTC (Z) para São Paulo', () => {
    const [e] = icsParaEventos(vevento('SUMMARY:A', 'DTSTART:20261005T233000Z', 'DTEND:20261006T003000Z'));
    expect(e).toMatchObject({ inicio: '2026-10-05T20:30', fim: '2026-10-05T21:30', dia_inteiro: 0 });
  });

  it('converte outro fuso (TZID) e trata horário sem fuso como São Paulo', () => {
    expect(icsParaEventos(vevento('DTSTART;TZID=America/New_York:20261005T100000'))[0].inicio).toBe('2026-10-05T11:00');
    expect(icsParaEventos(vevento('DTSTART:20261005T100000'))[0].inicio).toBe('2026-10-05T10:00');
  });

  it('sem DTEND o fim fica vazio; com DURATION soma a duração', () => {
    expect(icsParaEventos(vevento('DTSTART:20261005T100000'))[0].fim).toBeNull();
    expect(icsParaEventos(vevento('DTSTART:20261005T100000', 'DURATION:PT1H30M'))[0].fim).toBe('2026-10-05T11:30');
    expect(icsParaEventos(vevento('DTSTART;VALUE=DATE:20261005'))[0]).toMatchObject({ dia_inteiro: 1, inicio: '2026-10-05', fim: null });
    expect(icsParaEventos(vevento('DTSTART;VALUE=DATE:20261005', 'DURATION:P3D'))[0].fim).toBe('2026-10-07');
  });

  it('sem SUMMARY vira "(sem título)"; sem DTSTART ou cancelado é ignorado', () => {
    expect(icsParaEventos(vevento('DTSTART:20261005T100000'))[0].titulo).toBe('(sem título)');
    expect(icsParaEventos(vevento('SUMMARY:x'))).toEqual([]);
    expect(icsParaEventos(vevento('SUMMARY:x', 'DTSTART:20261005T100000', 'STATUS:CANCELLED'))).toEqual([]);
  });

  it('lê vários eventos, desdobra linhas e ignora alarmes e outros blocos', () => {
    const texto = ics(
      'BEGIN:VTIMEZONE', 'TZID:America/Sao_Paulo', 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'END:STANDARD', 'END:VTIMEZONE',
      'BEGIN:VEVENT', 'UID:a', 'SUMMARY:Primeiro', 'DTSTART:20261005T100000', 'DESCRIPTION:linha um', ' continua', 'BEGIN:VALARM', 'DESCRIPTION:alarme', 'END:VALARM', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:b', 'SUMMARY:Segundo', 'DTSTART;VALUE=DATE:20261006', 'END:VEVENT',
    );
    const lista = icsParaEventos(texto);
    expect(lista.map((e) => e.uid)).toEqual(['a', 'b']);
    expect(lista[0].notas).toBe('linha umcontinua');
  });

  it('ocorrências com RECURRENCE-ID (exceções) são ignoradas', () => {
    expect(icsParaEventos(vevento('SUMMARY:x', 'DTSTART:20261005T100000', 'RECURRENCE-ID:20261005T100000'))).toEqual([]);
  });
});

describe('recorrência', () => {
  const janela = (de, ate) => ({ de, ate });

  it('semanal com COUNT é expandida dentro da janela, com uid por ocorrência', () => {
    const texto = vevento('SUMMARY:Semanal', 'DTSTART:20261005T100000', 'DTEND:20261005T110000', 'RRULE:FREQ=WEEKLY;COUNT=4');
    const lista = icsParaEventos(texto, janela('2026-10-10', '2026-10-31'));
    expect(lista.map((e) => [e.uid, e.inicio, e.fim, e.recorrente])).toEqual([
      ['x1#2026-10-12', '2026-10-12T10:00', '2026-10-12T11:00', 1],
      ['x1#2026-10-19', '2026-10-19T10:00', '2026-10-19T11:00', 1],
      ['x1#2026-10-26', '2026-10-26T10:00', '2026-10-26T11:00', 1],
    ]);
  });

  it('mensal no dia 31 pula os meses que não têm esse dia', () => {
    const lista = icsParaEventos(vevento('SUMMARY:M', 'DTSTART;VALUE=DATE:20260131', 'RRULE:FREQ=MONTHLY'), janela('2026-01-01', '2026-05-31'));
    expect(lista.map((e) => e.inicio)).toEqual(['2026-01-31', '2026-03-31', '2026-05-31']);
    expect(lista.every((e) => e.dia_inteiro === 1)).toBe(true);
  });

  it('diário com INTERVAL e UNTIL, anual com INTERVAL', () => {
    const diario = icsParaEventos(vevento('SUMMARY:D', 'DTSTART:20261001T080000', 'RRULE:FREQ=DAILY;INTERVAL=2;UNTIL=20261007T235959Z'), janela('2026-10-01', '2026-10-31'));
    expect(diario.map((e) => e.inicio.slice(0, 10))).toEqual(['2026-10-01', '2026-10-03', '2026-10-05', '2026-10-07']);
    const anual = icsParaEventos(vevento('SUMMARY:A', 'DTSTART;VALUE=DATE:20260315', 'RRULE:FREQ=YEARLY'), janela('2026-01-01', '2028-12-31'));
    expect(anual.map((e) => e.inicio)).toEqual(['2026-03-15', '2027-03-15', '2028-03-15']);
  });

  it('regra complexa vira só a primeira ocorrência, marcada como recorrente', () => {
    const texto = vevento('SUMMARY:C', 'DTSTART:20261005T100000', 'RRULE:FREQ=MONTHLY;BYDAY=MO,WE;BYSETPOS=1;COUNT=3');
    const lista = icsParaEventos(texto, janela('2026-10-01', '2027-03-31'));
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ uid: 'x1#2026-10-05', inicio: '2026-10-05T10:00', recorrente: 1 });
  });

  it('sem janela, devolve só a primeira ocorrência; fora da janela não devolve nada', () => {
    const texto = vevento('SUMMARY:S', 'DTSTART:20261005T100000', 'RRULE:FREQ=WEEKLY');
    expect(icsParaEventos(texto)).toHaveLength(1);
    expect(icsParaEventos(vevento('SUMMARY:S', 'DTSTART:20261005T100000', 'RRULE:FREQ=WEEKLY;COUNT=2'), janela('2027-01-01', '2027-02-01'))).toEqual([]);
  });
});
