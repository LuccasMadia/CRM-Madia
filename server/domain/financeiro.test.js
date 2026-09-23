import { describe, it, expect } from 'vitest';
import { estadoParcela, resumoParcelas, aReceberNoMes, recebidoPorMes } from './financeiro.js';

const HOJE = '2026-09-23';
const parcelas = [
  { valor_centavos: 1000, vencimento: '2026-09-01', pago_em: '2026-09-02' },
  { valor_centavos: 2000, vencimento: '2026-09-10', pago_em: null },
  { valor_centavos: 3000, vencimento: '2026-09-30', pago_em: null },
  { valor_centavos: 4000, vencimento: '2026-10-15', pago_em: null },
];

describe('financeiro', () => {
  it('estadoParcela', () => {
    expect(estadoParcela(parcelas[0], HOJE)).toBe('paga');
    expect(estadoParcela(parcelas[1], HOJE)).toBe('atrasada');
    expect(estadoParcela(parcelas[2], HOJE)).toBe('pendente');
    expect(estadoParcela({ vencimento: HOJE, pago_em: null }, HOJE)).toBe('pendente');
  });

  it('resumoParcelas soma por estado e calcula o não parcelado', () => {
    expect(resumoParcelas(parcelas, HOJE, 12000)).toEqual({
      total_centavos: 10000,
      pago_centavos: 1000,
      pendente_centavos: 7000,
      atrasado_centavos: 2000,
      nao_parcelado_centavos: 2000,
    });
  });

  it('não parcelado fica negativo quando as parcelas passam do valor', () => {
    expect(resumoParcelas(parcelas, HOJE, 5000).nao_parcelado_centavos).toBe(-5000);
  });

  it('aReceberNoMes soma não pagas que vencem no mês de hoje', () => {
    expect(aReceberNoMes(parcelas, HOJE)).toBe(5000);
  });

  it('recebidoPorMes agrupa pagamentos por mês do pagamento', () => {
    const meses = recebidoPorMes(
      [...parcelas, { valor_centavos: 500, vencimento: '2025-12-01', pago_em: '2025-12-20' }],
      2026,
    );
    expect(meses).toHaveLength(12);
    expect(meses[8]).toEqual({ mes: '2026-09', recebido_centavos: 1000 });
    expect(meses.reduce((s, m) => s + m.recebido_centavos, 0)).toBe(1000);
  });
});
