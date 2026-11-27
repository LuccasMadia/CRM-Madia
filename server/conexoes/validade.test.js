import { describe, it, expect } from 'vitest';
import { situacaoValidade } from './validade.js';

const HOJE = '2026-11-26';

describe('situacaoValidade', () => {
  it('sem data não há situação', () => {
    expect(situacaoValidade(null, HOJE)).toBeNull();
    expect(situacaoValidade('', HOJE)).toBeNull();
  });

  it.each([
    ['2026-12-26', { estado: 'ok', dias: 30 }],
    ['2026-12-03', { estado: 'vence', dias: 7 }],
    ['2026-12-04', { estado: 'ok', dias: 8 }],
    ['2026-11-26', { estado: 'vence', dias: 0 }],
    ['2026-11-25', { estado: 'venceu', dias: 1 }],
    ['2026-11-10', { estado: 'venceu', dias: 16 }],
  ])('validade %s', (validade, esperado) => {
    expect(situacaoValidade(validade, HOJE)).toEqual(esperado);
  });

  it('aceita data com hora (como a do Instagram) olhando só o dia', () => {
    expect(situacaoValidade('2026-11-29T10:00:00.000Z', HOJE)).toEqual({ estado: 'vence', dias: 3 });
  });

  it('o limite de aviso pode mudar', () => {
    expect(situacaoValidade('2026-12-10', HOJE, 14)).toEqual({ estado: 'vence', dias: 14 });
  });
});
