import { describe, it, expect } from 'vitest';
import { corDaEmpresa } from './cores.js';

describe('corDaEmpresa', () => {
  it('dá sempre a mesma cor para a mesma empresa e cores diferentes para ids vizinhos', () => {
    expect(corDaEmpresa(3)).toBe(corDaEmpresa(3));
    expect(corDaEmpresa(1)).not.toBe(corDaEmpresa(2));
    expect(corDaEmpresa(1)).toMatch(/^var\(--tag-[a-z]+\)$/);
    expect(corDaEmpresa(undefined)).toMatch(/^var\(--tag-/);
  });
});
