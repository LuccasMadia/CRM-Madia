import { describe, it, expect } from 'vitest';
import { crc16, gerarCodigoPix } from './pix.js';

describe('crc16', () => {
  it('calcula CRC-16/CCITT-FALSE (vetor de teste padrão: "123456789" → 0x29B1)', () => {
    expect(crc16('123456789')).toBe('29B1');
  });
});

describe('gerarCodigoPix', () => {
  it('monta o payload com GUI do Pix, a chave e CRC final consistente', () => {
    const codigo = gerarCodigoPix({ chave: 'popy@email.com', nomeRecebedor: 'Popy', cidade: 'Sao Paulo' });
    expect(codigo.startsWith('000201')).toBe(true);
    expect(codigo).toContain('br.gov.bcb.pix');
    expect(codigo).toContain('popy@email.com');
    const semCrc = codigo.slice(0, -4);
    const crcInformado = codigo.slice(-4);
    expect(crcInformado).toBe(crc16(semCrc));
  });

  it('não inclui campo de valor (54) — valor livre', () => {
    const codigo = gerarCodigoPix({ chave: 'popy@email.com', nomeRecebedor: 'Popy', cidade: 'Sao Paulo' });
    expect(codigo).not.toMatch(/5405\d/);
  });

  it('remove acentos, maiusculiza e corta nome/cidade nos limites do BR Code', () => {
    const codigo = gerarCodigoPix({
      chave: 'popy@email.com',
      nomeRecebedor: 'Pousada Açaí e Café Com Leite Gelado',
      cidade: 'São José dos Campos',
    });
    expect(codigo).toContain('POUSADA ACAI E CAFE COM LEI'.slice(0, 25));
    expect(codigo).toContain('SAO JOSE DOS C'.slice(0, 15));
    expect(codigo).not.toMatch(/[çãéÇÃÉ]/i);
  });
});
