import { describe, it, expect } from 'vitest';
import { hojeLocal, somarDias, somarMeses, mesDe, dataNoMes, dataValida } from './datas.js';

describe('datas', () => {
  it('hojeLocal usa o fuso local no formato ISO', () => {
    expect(hojeLocal(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
  it('somarDias atravessa meses e anos', () => {
    expect(somarDias('2026-09-28', 7)).toBe('2026-10-05');
    expect(somarDias('2026-12-30', 3)).toBe('2027-01-02');
  });
  it('mesDe corta o dia', () => {
    expect(mesDe('2026-09-23')).toBe('2026-09');
  });
  it('somarMeses preserva o dia e atravessa anos', () => {
    expect(somarMeses('2026-04-10', 0)).toBe('2026-04-10');
    expect(somarMeses('2026-04-10', 1)).toBe('2026-05-10');
    expect(somarMeses('2026-10-10', 3)).toBe('2027-01-10');
  });
  it('somarMeses ajusta para o último dia quando o mês de destino é mais curto', () => {
    expect(somarMeses('2026-01-31', 1)).toBe('2026-02-28');
    expect(somarMeses('2024-01-31', 1)).toBe('2024-02-29');
  });
  it('dataNoMes monta a data no dia informado, com clamp de fim de mês', () => {
    expect(dataNoMes('2026-09', 10)).toBe('2026-09-10');
    expect(dataNoMes('2026-02', 31)).toBe('2026-02-28');
    expect(dataNoMes('2024-02', 31)).toBe('2024-02-29');
  });
  it('dataValida rejeita formatos e dias inexistentes', () => {
    expect(dataValida('2026-02-28')).toBe(true);
    expect(dataValida('2026-02-30')).toBe(false);
    expect(dataValida('23/09/2026')).toBe(false);
    expect(dataValida('')).toBe(false);
  });
});
