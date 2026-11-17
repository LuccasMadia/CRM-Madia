import { describe, it, expect } from 'vitest';
import { idsComNome } from './desenho.js';

describe('idsComNome', () => {
  it('até 12 acesos: todos ganham nome', () => {
    const acesos = new Set(['a', 'b', 'tarefa:1']);
    expect(idsComNome(acesos, 'a')).toEqual(['a', 'b', 'tarefa:1']);
  });
  it('mais de 12: só o ativo e projetos/clientes', () => {
    const acesos = new Set(['app:x', 'projeto:1', 'cliente:2', ...Array.from({ length: 12 }, (_, i) => `tarefa:${i}`)]);
    expect(idsComNome(acesos, 'app:x')).toEqual(['app:x', 'projeto:1', 'cliente:2']);
  });
});
