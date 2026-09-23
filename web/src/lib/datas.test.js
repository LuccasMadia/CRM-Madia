import { describe, it, expect } from 'vitest';
import { formatarData, semanasDoMes, nomeMes } from './datas.js';

describe('datas (web)', () => {
  it('formatarData', () => {
    expect(formatarData('2026-09-23')).toBe('23/09/2026');
    expect(formatarData(null)).toBe('—');
  });

  it('nomeMes', () => {
    expect(nomeMes('2026-09')).toBe('setembro de 2026');
  });

  it('semanasDoMes começa no domingo e cobre o mês inteiro', () => {
    const setembro = semanasDoMes(2026, 9);
    expect(setembro).toHaveLength(5);
    expect(setembro[0][0]).toEqual({ data: '2026-08-30', doMes: false });
    expect(setembro[0][2]).toEqual({ data: '2026-09-01', doMes: true });
    expect(setembro[4][6]).toEqual({ data: '2026-10-03', doMes: false });
    expect(semanasDoMes(2026, 2)).toHaveLength(4); // fev/2026 começa num domingo e termina num sábado
  });
});
