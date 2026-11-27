import { describe, it, expect } from 'vitest';
import { diasDaSemana, eventosDoDia, intervalo, mover, rotuloHora, somarDias } from './datasCalendario.js';

const ev = (extra) => ({ id: 1, titulo: 'x', inicio: '2026-10-05T14:00', fim: null, dia_inteiro: 0, ...extra });

describe('datas do calendário', () => {
  it('somarDias atravessa mês e ano', () => {
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('diasDaSemana começa no domingo', () => {
    expect(diasDaSemana('2026-10-15')).toEqual(['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17']);
  });

  it('intervalo de cada visão', () => {
    expect(intervalo('mes', '2026-10-15')).toEqual({ de: '2026-09-27', ate: '2026-10-31' });
    expect(intervalo('semana', '2026-10-15')).toEqual({ de: '2026-10-11', ate: '2026-10-17' });
    expect(intervalo('lista', '2026-10-15')).toEqual({ de: '2026-10-01', ate: '2026-10-31' });
  });

  it('mover anda uma semana ou um mês', () => {
    expect(mover('mes', '2026-10-15', 1)).toBe('2026-11-01');
    expect(mover('semana', '2026-10-15', -1)).toBe('2026-10-08');
    expect(mover('lista', '2026-01-15', -1)).toBe('2025-12-01');
  });
});

describe('eventosDoDia', () => {
  it('evento de vários dias aparece em todos, com o último dia inclusive', () => {
    const e = ev({ dia_inteiro: 1, inicio: '2026-10-05', fim: '2026-10-07' });
    expect(['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'].map((d) => eventosDoDia([e], d).length)).toEqual([0, 1, 1, 1, 0]);
  });

  it('evento que cruza a meia-noite aparece nos dois dias', () => {
    const e = ev({ inicio: '2026-10-05T23:00', fim: '2026-10-06T01:00' });
    expect(eventosDoDia([e], '2026-10-05')).toHaveLength(1);
    expect(eventosDoDia([e], '2026-10-06')).toHaveLength(1);
    expect(eventosDoDia([e], '2026-10-07')).toHaveLength(0);
  });

  it('evento que termina à meia-noite em ponto não invade o dia seguinte', () => {
    const e = ev({ inicio: '2026-10-05T22:00', fim: '2026-10-06T00:00' });
    expect(eventosDoDia([e], '2026-10-05')).toHaveLength(1);
    expect(eventosDoDia([e], '2026-10-06')).toHaveLength(0);
  });

  it('sem fim fica só no dia do início; ordena dia inteiro primeiro e depois por hora', () => {
    const tarde = ev({ id: 1, inicio: '2026-10-05T15:00' });
    const cedo = ev({ id: 2, inicio: '2026-10-05T08:00' });
    const inteiro = ev({ id: 3, inicio: '2026-10-05', dia_inteiro: 1 });
    expect(eventosDoDia([tarde, cedo, inteiro], '2026-10-05').map((e) => e.id)).toEqual([3, 2, 1]);
    expect(eventosDoDia([tarde], '2026-10-06')).toEqual([]);
  });
});

describe('rotuloHora', () => {
  it('dia inteiro, hora de início e continuação', () => {
    expect(rotuloHora(ev({ inicio: '2026-10-05', dia_inteiro: 1 }), '2026-10-05')).toBe('Dia inteiro');
    expect(rotuloHora(ev(), '2026-10-05')).toBe('14:00');
    const longo = ev({ inicio: '2026-10-05T23:00', fim: '2026-10-06T01:30' });
    expect(rotuloHora(longo, '2026-10-06')).toBe('até 01:30');
    expect(rotuloHora(ev({ inicio: '2026-10-05T10:00', fim: '2026-10-07T10:00' }), '2026-10-06')).toBe('Dia inteiro');
  });
});
