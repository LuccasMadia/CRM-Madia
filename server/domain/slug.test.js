import { describe, it, expect } from 'vitest';
import { gerarSlug } from './slug.js';

describe('gerarSlug', () => {
  it('remove acentos, espaços e símbolos', () => {
    expect(gerarSlug('Canecas da Dri')).toBe('canecas-da-dri');
    expect(gerarSlug('  Ação & Reação! 2026 ')).toBe('acao-reacao-2026');
  });
});
