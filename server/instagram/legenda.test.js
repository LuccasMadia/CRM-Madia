import { describe, it, expect } from 'vitest';
import { normalizarLegenda, tipoDaMidia } from './legenda.js';

describe('normalizarLegenda', () => {
  it('ignora caixa, acentos, emojis, hashtags e espaços extras', () => {
    expect(normalizarLegenda('  Olá, MUNDO!  🚀 #nfc #site\n\nnova  linha')).toBe('ola, mundo! nova linha');
  });
  it('legenda só com hashtags e emojis fica vazia', () => {
    expect(normalizarLegenda('#so #hashtags 😀')).toBe('');
  });
  it('trata legenda ausente como vazia', () => {
    expect(normalizarLegenda(null)).toBe('');
    expect(normalizarLegenda(undefined)).toBe('');
  });
  it('compara só os primeiros 60 caracteres', () => {
    expect(normalizarLegenda('a'.repeat(100))).toHaveLength(60);
    expect(normalizarLegenda(`${'b'.repeat(60)} fim diferente`)).toBe(normalizarLegenda(`${'b'.repeat(60)} outro fim`));
  });
});

describe('tipoDaMidia', () => {
  it('converte os tipos da API', () => {
    expect(tipoDaMidia({ media_type: 'VIDEO', media_product_type: 'REELS' })).toBe('reels');
    expect(tipoDaMidia({ media_type: 'CAROUSEL_ALBUM', media_product_type: 'FEED' })).toBe('carrossel');
    expect(tipoDaMidia({ media_type: 'IMAGE', media_product_type: 'FEED' })).toBe('post');
    expect(tipoDaMidia({ media_type: 'VIDEO', media_product_type: 'FEED' })).toBe('reels');
  });
});
