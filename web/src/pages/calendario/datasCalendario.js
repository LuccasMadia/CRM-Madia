import { semanasDoMes } from '../../lib/datas.js';

const DIA = 86_400_000;

export const somarDias = (dia, n) => new Date(Date.parse(`${dia}T00:00:00Z`) + n * DIA).toISOString().slice(0, 10);

export function diasDaSemana(dia) {
  const domingo = somarDias(dia, -new Date(`${dia}T00:00:00Z`).getUTCDay());
  return Array.from({ length: 7 }, (_, i) => somarDias(domingo, i));
}

const doMes = (ancora) => ancora.slice(0, 7).split('-').map(Number);

// Dias que a visão mostra: o mês com as semanas inteiras, a semana, ou o mês (lista).
export function intervalo(modo, ancora) {
  if (modo === 'semana') {
    const dias = diasDaSemana(ancora);
    return { de: dias[0], ate: dias[6] };
  }
  const [ano, mes] = doMes(ancora);
  if (modo === 'mes') {
    const dias = semanasDoMes(ano, mes).flat();
    return { de: dias[0].data, ate: dias[dias.length - 1].data };
  }
  return { de: `${ancora.slice(0, 7)}-01`, ate: somarDias(new Date(Date.UTC(ano, mes, 1)).toISOString().slice(0, 10), -1) };
}

// Passo da navegação ← →: uma semana na semanal, um mês nas outras (sempre para o dia 1).
export function mover(modo, ancora, passo) {
  if (modo === 'semana') return somarDias(ancora, 7 * passo);
  const [ano, mes] = doMes(ancora);
  return new Date(Date.UTC(ano, mes - 1 + passo, 1)).toISOString().slice(0, 10);
}

// Último dia em que o evento aparece. Fim à meia-noite em ponto pertence ao dia anterior.
function ultimoDia(evento) {
  const inicio = evento.inicio.slice(0, 10);
  if (!evento.fim) return inicio;
  const fim = evento.fim.slice(0, 10);
  if (!evento.dia_inteiro && fim > inicio && evento.fim.slice(11, 16) === '00:00') return somarDias(fim, -1);
  return fim < inicio ? inicio : fim;
}

export function eventosDoDia(eventos, dia) {
  return eventos
    .filter((e) => e.inicio.slice(0, 10) <= dia && dia <= ultimoDia(e))
    .sort((a, b) => (b.dia_inteiro - a.dia_inteiro) || a.inicio.localeCompare(b.inicio) || a.id - b.id);
}

export function rotuloHora(evento, dia) {
  if (evento.dia_inteiro) return 'Dia inteiro';
  const inicio = evento.inicio.slice(0, 10);
  if (dia === inicio) return evento.inicio.slice(11, 16);
  if (evento.fim && dia === ultimoDia(evento)) return `até ${evento.fim.slice(11, 16)}`;
  return 'Dia inteiro';
}
