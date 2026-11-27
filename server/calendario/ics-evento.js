// Conversão entre eventos do CRM e VEVENT (RFC 5545), sem biblioteca. Horário sempre em America/Sao_Paulo.
const SP = 'America/Sao_Paulo';
const DIA = 24 * 60 * 60 * 1000;
const MINUTO = 60 * 1000;
const pad = (n, tam = 2) => String(n).padStart(tam, '0');

// "Relógio de parede" como milissegundos UTC (naive): só serve para somar e comparar datas e horas.
const naive = (a, m, d, h = 0, mi = 0) => Date.UTC(a, m - 1, d, h, mi);
const dataDe = (ms) => new Date(ms).toISOString().slice(0, 10);
const textoMomento = (ms) => new Date(ms).toISOString().slice(0, 16);
const deTexto = (t) => {
  const [, a, m, d, h = '0', mi = '0'] = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(t);
  return naive(+a, +m, +d, +h, +mi);
};
const basico = (ms, comHora) => {
  const iso = new Date(ms).toISOString();
  return comHora ? `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}00` : iso.slice(0, 10).replaceAll('-', '');
};
const deBasico = (t) => naive(+t.slice(0, 4), +t.slice(4, 6), +t.slice(6, 8), +(t.slice(9, 11) || 0), +(t.slice(11, 13) || 0));

// --- fusos (Intl) ---
function relogioEm(instante, fuso) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: fuso, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(instante)).map((x) => [x.type, x.value]),
  );
  return naive(+p.year, +p.month, +p.day, +p.hour, +p.minute);
}
const instanteDe = (parede, fuso) => {
  const primeiro = parede - (relogioEm(parede, fuso) - parede);
  return parede - (relogioEm(primeiro, fuso) - primeiro);
};
// Momento lido do ICS → parede de São Paulo.
function paraSaoPaulo(valor, fuso) {
  const parede = deBasico(valor);
  if (valor.endsWith('Z')) return relogioEm(parede, SP);
  if (!fuso || fuso === SP) return parede;
  try {
    return relogioEm(instanteDe(parede, fuso), SP);
  } catch {
    return parede;
  }
}

// --- texto ---
const escapar = (t) => String(t).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/[;,]/g, '\\$&');
const desescapar = (t) => t.replace(/\\([nN,;\\])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c));

// Dobra em 75 octetos sem partir caractere multibyte; a continuação começa com um espaço.
function dobrar(linha) {
  const partes = [];
  let atual = '';
  let bytes = 0;
  for (const ch of linha) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > 75) { partes.push(atual); atual = ' '; bytes = 1; }
    atual += ch;
    bytes += b;
  }
  partes.push(atual);
  return partes.join('\r\n');
}

const VTIMEZONE = ['BEGIN:VTIMEZONE', `TZID:${SP}`, 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:-0300', 'TZOFFSETTO:-0300', 'TZNAME:-03', 'END:STANDARD', 'END:VTIMEZONE'];

// evento: { uid, titulo, inicio, fim, dia_inteiro, local, notas, atualizado_em? }
export function eventoParaIcs(evento) {
  const diaInteiro = Boolean(evento.dia_inteiro);
  const carimbo = evento.atualizado_em ? new Date(evento.atualizado_em) : new Date();
  const dtstamp = `${basico(carimbo.getTime(), true)}Z`;
  const linhas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CRM Madia//Calendario//PT-BR', 'CALSCALE:GREGORIAN'];
  if (!diaInteiro) linhas.push(...VTIMEZONE);
  linhas.push('BEGIN:VEVENT', `UID:${evento.uid}`, `DTSTAMP:${dtstamp}`, `SUMMARY:${escapar(evento.titulo)}`);
  if (diaInteiro) {
    const ultimo = deTexto(evento.fim ?? evento.inicio);
    linhas.push(`DTSTART;VALUE=DATE:${basico(deTexto(evento.inicio), false)}`, `DTEND;VALUE=DATE:${basico(ultimo + DIA, false)}`);
  } else {
    linhas.push(`DTSTART;TZID=${SP}:${basico(deTexto(evento.inicio), true)}`);
    if (evento.fim) linhas.push(`DTEND;TZID=${SP}:${basico(deTexto(evento.fim), true)}`);
  }
  if (evento.local) linhas.push(`LOCATION:${escapar(evento.local)}`);
  if (evento.notas) linhas.push(`DESCRIPTION:${escapar(evento.notas)}`);
  linhas.push('END:VEVENT', 'END:VCALENDAR');
  return `${linhas.map(dobrar).join('\r\n')}\r\n`;
}

// --- leitura ---
function linhasDe(texto) {
  return texto.replace(/\r?\n[ \t]/g, '').split(/\r?\n/).filter(Boolean);
}

function propriedade(linha) {
  let aspas = false;
  let corte = -1;
  for (let i = 0; i < linha.length; i += 1) {
    if (linha[i] === '"') aspas = !aspas;
    else if (linha[i] === ':' && !aspas) { corte = i; break; }
  }
  if (corte < 0) return null;
  const [nome, ...resto] = linha.slice(0, corte).split(';');
  const params = Object.fromEntries(resto.map((p) => { const [k, ...v] = p.split('='); return [k.toUpperCase(), v.join('=').replace(/"/g, '')]; }));
  return { nome: nome.toUpperCase(), params, valor: linha.slice(corte + 1) };
}

// Só as propriedades do próprio VEVENT (blocos internos, como VALARM, ficam de fora).
function vevents(texto) {
  const eventos = [];
  let atual = null;
  let fundo = 0;
  for (const linha of linhasDe(texto)) {
    const p = propriedade(linha);
    if (!p) continue;
    if (p.nome === 'BEGIN' && p.valor.toUpperCase() === 'VEVENT' && !atual) { atual = {}; fundo = 0; continue; }
    if (!atual) continue;
    if (p.nome === 'BEGIN') { fundo += 1; continue; }
    if (p.nome === 'END') {
      if (fundo > 0) fundo -= 1;
      else { eventos.push(atual); atual = null; }
      continue;
    }
    if (fundo === 0 && !(p.nome in atual)) atual[p.nome] = p;
  }
  return eventos;
}

function duracaoEmMinutos(texto) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(texto);
  if (!m) return null;
  const [, sinal, s = 0, d = 0, h = 0, mi = 0] = m;
  const minutos = (+s * 7 + +d) * 1440 + +h * 60 + +mi;
  return sinal === '-' ? -minutos : minutos;
}

const SIMPLES = new Set(['FREQ', 'INTERVAL', 'COUNT', 'UNTIL', 'WKST']);
const FREQS = new Set(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']);

function lerRegra(texto) {
  const regra = Object.fromEntries(texto.split(';').map((p) => { const [k, v = ''] = p.split('='); return [k.toUpperCase(), v]; }));
  return { regra, simples: FREQS.has(regra.FREQ) && Object.keys(regra).every((k) => SIMPLES.has(k)) };
}

// Inícios (parede) das ocorrências de uma regra simples que tocam a janela; `duracao` em ms.
function expandir(inicio, duracao, regra, { de, ate }) {
  const passo = Math.max(1, Number(regra.INTERVAL) || 1);
  const limite = regra.COUNT ? Number(regra.COUNT) : Infinity;
  const ate_ = regra.UNTIL ? (regra.UNTIL.endsWith('Z') ? dataDe(relogioEm(deBasico(regra.UNTIL), SP)) : dataDe(deBasico(regra.UNTIL))) : null;
  const base = new Date(inicio);
  const saida = [];
  let emitidas = 0;
  for (let k = 0; k < 20000 && emitidas < limite; k += 1) {
    let candidato;
    if (regra.FREQ === 'DAILY') candidato = inicio + k * passo * DIA;
    else if (regra.FREQ === 'WEEKLY') candidato = inicio + k * passo * 7 * DIA;
    else {
      const meses = regra.FREQ === 'MONTHLY' ? k * passo : k * passo * 12;
      candidato = Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + meses, base.getUTCDate(), base.getUTCHours(), base.getUTCMinutes());
      if (new Date(candidato).getUTCDate() !== base.getUTCDate()) continue; // dia que não existe no mês: pula
    }
    const dia = dataDe(candidato);
    if (dia > ate) break;
    if (ate_ && dia > ate_) break;
    emitidas += 1;
    if (dataDe(candidato + duracao) >= de) saida.push(candidato);
  }
  return saida;
}

// Converte os VEVENT de um ICS em eventos do CRM. Com `janela` {de, ate} (AAAA-MM-DD), expande recorrências simples;
// sem janela, ou com regra complexa, devolve só a primeira ocorrência. Ocorrências de recorrentes ganham uid "UID#AAAA-MM-DD".
export function icsParaEventos(texto, janela = null) {
  const lista = [];
  vevents(texto).forEach((v, i) => {
    if (!v.DTSTART || v['RECURRENCE-ID'] || v.STATUS?.valor.toUpperCase() === 'CANCELLED') return;
    const uid = v.UID?.valor || `sem-uid-${i}`;
    const diaInteiro = v.DTSTART.params.VALUE === 'DATE' || /^\d{8}$/.test(v.DTSTART.valor);
    const duracao = v.DURATION ? duracaoEmMinutos(v.DURATION.valor) : null;
    let inicio;
    let fim = null;
    if (diaInteiro) {
      inicio = deBasico(v.DTSTART.valor);
      let ultimo = null;
      if (v.DTEND) ultimo = deBasico(v.DTEND.valor) - DIA;
      else if (duracao) ultimo = inicio + (Math.ceil(duracao / 1440) - 1) * DIA;
      fim = ultimo !== null && ultimo > inicio ? ultimo : null;
    } else {
      inicio = paraSaoPaulo(v.DTSTART.valor, v.DTSTART.params.TZID);
      if (v.DTEND) fim = paraSaoPaulo(v.DTEND.valor, v.DTEND.params.TZID);
      else if (duracao) fim = inicio + duracao * MINUTO;
    }
    const molde = {
      titulo: v.SUMMARY ? desescapar(v.SUMMARY.valor) || '(sem título)' : '(sem título)',
      dia_inteiro: diaInteiro ? 1 : 0,
      local: v.LOCATION ? desescapar(v.LOCATION.valor) : null,
      notas: v.DESCRIPTION ? desescapar(v.DESCRIPTION.valor) : null,
    };
    const formatar = (i0, f0) => (diaInteiro ? [dataDe(i0), f0 === null ? null : dataDe(f0)] : [textoMomento(i0), f0 === null ? null : textoMomento(f0)]);
    const montar = (i0, f0, recorrente) => {
      const [ini, fi] = formatar(i0, f0);
      return { uid: recorrente ? `${uid}#${ini.slice(0, 10)}` : uid, titulo: molde.titulo, inicio: ini, fim: fi, dia_inteiro: molde.dia_inteiro, local: molde.local, notas: molde.notas, recorrente: recorrente ? 1 : 0 };
    };

    if (!v.RRULE) { lista.push(montar(inicio, fim, false)); return; }
    const { regra, simples } = lerRegra(v.RRULE.valor);
    if (!janela || !simples) { lista.push(montar(inicio, fim, true)); return; }
    const duracaoMs = fim === null ? 0 : fim - inicio;
    for (const ocorrencia of expandir(inicio, duracaoMs, regra, janela)) lista.push(montar(ocorrencia, fim === null ? null : ocorrencia + duracaoMs, true));
  });
  return lista;
}
