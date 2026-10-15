import { describe, it, expect } from 'vitest';
import { calcularValorTotal, valorLinhaServico, TIPOS_SERVICO } from './servicos.js';

describe('TIPOS_SERVICO', () => {
  it('tem os 4 tipos fixos, nessa ordem', () => {
    expect(TIPOS_SERVICO).toEqual(['placas_nfc', 'sistemas', 'saas', 'google_meu_negocio']);
  });
});

describe('valorLinhaServico', () => {
  it('multiplica valor unitário pela quantidade', () => {
    expect(valorLinhaServico({ valor_unitario_centavos: 1000, quantidade: 3 })).toBe(3000);
  });

  it('assume quantidade 1 quando omitida', () => {
    expect(valorLinhaServico({ valor_unitario_centavos: 1500 })).toBe(1500);
  });
});

describe('calcularValorTotal', () => {
  it('soma as linhas e aplica o desconto', () => {
    const servicos = [
      { valor_unitario_centavos: 10000, quantidade: 2 },
      { valor_unitario_centavos: 5000, quantidade: 1 },
    ];
    expect(calcularValorTotal(servicos, 3000)).toBe(22000);
  });

  it('nunca fica negativo quando o desconto é maior que a soma', () => {
    const servicos = [{ valor_unitario_centavos: 1000, quantidade: 1 }];
    expect(calcularValorTotal(servicos, 5000)).toBe(0);
  });

  it('sem serviços e sem desconto, o total é zero', () => {
    expect(calcularValorTotal([], 0)).toBe(0);
  });
});

describe('valorLinhaServico com valor_total_centavos', () => {
  it('usa o total da linha quando existe', () => {
    expect(valorLinhaServico({ valor_unitario_centavos: 6667, quantidade: 3, valor_total_centavos: 20000 })).toBe(20000);
  });

  it('sem total (null), continua unitário × quantidade', () => {
    expect(valorLinhaServico({ valor_unitario_centavos: 5000, quantidade: 2, valor_total_centavos: null })).toBe(10000);
  });
});
