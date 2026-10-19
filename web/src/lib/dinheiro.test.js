import { describe, it, expect, afterEach } from 'vitest';
import { formatarDinheiro, paraCentavos, centavosParaTexto, VALOR_OCULTO } from './dinheiro.js';
import { definirValoresOcultos } from './privacidade.js';

describe('dinheiro', () => {
  afterEach(() => definirValoresOcultos(false));

  it('com os valores ocultos, não mostra o número', () => {
    definirValoresOcultos(true);
    expect(formatarDinheiro(123456)).toBe(VALOR_OCULTO);
    expect(centavosParaTexto(123456)).toBe('1234,56');
  });

  it('formata em reais', () => {
    expect(formatarDinheiro(123456).replace(/\s/g, ' ')).toBe('R$ 1.234,56');
    expect(formatarDinheiro(null).replace(/\s/g, ' ')).toBe('R$ 0,00');
  });

  it.each([
    ['1.234,56', 123456],
    ['1500', 150000],
    ['1500,5', 150050],
    ['1500.5', 150050],
    ['1500.50', 150050],
    ['R$ 1.500,50', 150050],
    ['0,99', 99],
  ])('paraCentavos(%s) = %i', (texto, esperado) => {
    expect(paraCentavos(texto)).toBe(esperado);
  });

  it('vazio vira null e texto inválido vira NaN', () => {
    expect(paraCentavos('')).toBeNull();
    expect(paraCentavos('  ')).toBeNull();
    expect(paraCentavos('abc')).toBeNaN();
    expect(paraCentavos('-5')).toBeNaN();
    expect(paraCentavos('1,2,3')).toBeNaN();
  });

  it('centavosParaTexto prepara o valor para edição', () => {
    expect(centavosParaTexto(150050)).toBe('1500,50');
    expect(centavosParaTexto(null)).toBe('');
  });
});
