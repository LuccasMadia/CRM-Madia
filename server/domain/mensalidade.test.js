import { describe, it, expect } from 'vitest';
import { MODOS_INICIO_MENSALIDADE, inicioMensalidade, mensalidadesDevidas } from './mensalidade.js';

const base = {
  mensalidade_ativa: 1, mensalidade_dia_vencimento: 10, mensalidade_inicio_modo: 'entrega',
  data_inicio: '2026-07-01', data_entrega: '2026-08-15', mensalidade_inicio_data: '2026-09-05',
};

describe('inicioMensalidade', () => {
  it('lista os três modos na ordem da tela', () => {
    expect(MODOS_INICIO_MENSALIDADE).toEqual(['desenvolvimento', 'entrega', 'data']);
  });

  it('usa a data de cada modo', () => {
    expect(inicioMensalidade({ ...base, mensalidade_inicio_modo: 'desenvolvimento' })).toBe('2026-07-01');
    expect(inicioMensalidade({ ...base, mensalidade_inicio_modo: 'entrega' })).toBe('2026-08-15');
    expect(inicioMensalidade({ ...base, mensalidade_inicio_modo: 'data' })).toBe('2026-09-05');
  });

  it('sem modo vale entrega; sem a data do modo, não começou', () => {
    expect(inicioMensalidade({ ...base, mensalidade_inicio_modo: undefined })).toBe('2026-08-15');
    expect(inicioMensalidade({ ...base, data_entrega: null })).toBeNull();
    expect(inicioMensalidade({ ...base, mensalidade_inicio_modo: 'data', mensalidade_inicio_data: '' })).toBeNull();
  });
});

describe('mensalidadesDevidas', () => {
  it('a primeira vence na data do gatilho e as seguintes no dia escolhido, até o mês atual', () => {
    expect(mensalidadesDevidas(base, '2026-10-02')).toEqual(['2026-08-15', '2026-09-10', '2026-10-10']);
  });

  it('nada antes do início nem depois do mês de hoje', () => {
    expect(mensalidadesDevidas(base, '2026-07-31')).toEqual([]);
    expect(mensalidadesDevidas(base, '2026-08-01')).toEqual(['2026-08-15']);
  });

  it('dia 31 vira o último dia em meses curtos', () => {
    const p = { ...base, mensalidade_inicio_modo: 'data', mensalidade_inicio_data: '2026-01-31', mensalidade_dia_vencimento: 31 };
    expect(mensalidadesDevidas(p, '2026-03-05')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });

  it('sem dia de vencimento usa o dia do início', () => {
    const p = { ...base, mensalidade_dia_vencimento: null };
    expect(mensalidadesDevidas(p, '2026-09-20')).toEqual(['2026-08-15', '2026-09-15']);
  });

  it('desativada ou sem início não gera nada', () => {
    expect(mensalidadesDevidas({ ...base, mensalidade_ativa: 0 }, '2026-10-02')).toEqual([]);
    expect(mensalidadesDevidas({ ...base, data_entrega: null }, '2026-10-02')).toEqual([]);
  });
});
