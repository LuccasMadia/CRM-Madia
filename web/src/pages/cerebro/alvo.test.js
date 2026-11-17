import { describe, expect, it } from 'vitest';
import { criarGrade, maisProximo } from './alvo.js';

describe('alvo', () => {
  const g = criarGrade([{ id: 'a', x: 100, y: 100 }, { id: 'b', x: 105, y: 100 }, { id: 'c', x: 300, y: 300 }]);

  it('acha o mais próximo dentro do raio', () => {
    expect(maisProximo(g, { x: 103, y: 100 }, 10)).toBe('b');
    expect(maisProximo(g, { x: 98, y: 100 }, 10)).toBe('a');
    expect(maisProximo(g, { x: 300, y: 290 }, 10)).toBe('c');
  });

  it('devolve null fora do raio', () => {
    expect(maisProximo(g, { x: 200, y: 200 }, 10)).toBeNull();
    expect(maisProximo(g, { x: 100, y: 130 }, 10)).toBeNull();
  });

  it('5.000 pontos: 1.000 buscas em menos de 50 ms', () => {
    const itens = Array.from({ length: 5000 }, (_, i) => ({ id: i, x: (i * 37) % 600, y: (i * 91) % 600 }));
    const grade = criarGrade(itens);
    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) maisProximo(grade, { x: (i * 13) % 600, y: (i * 29) % 600 }, 6);
    expect(performance.now() - t0).toBeLessThan(50);
  });
});
