import { describe, it, expect } from 'vitest';
import { aplicarRegrasProjeto, aplicarRegrasConteudo } from './regras.js';

describe('aplicarRegrasProjeto', () => {
  it('preenche data_entrega ao mover para entregue', () => {
    expect(aplicarRegrasProjeto({ data_entrega: null }, { etapa: 'entregue' }, '2026-09-23')).toEqual({
      etapa: 'entregue',
      data_entrega: '2026-09-23',
    });
  });
  it('mantém data_entrega existente', () => {
    expect(aplicarRegrasProjeto({ data_entrega: '2026-08-01' }, { etapa: 'entregue' }, '2026-09-23')).toEqual({
      etapa: 'entregue',
    });
  });
  it('respeita data_entrega enviada junto', () => {
    expect(aplicarRegrasProjeto(null, { etapa: 'entregue', data_entrega: '2026-09-01' }, '2026-09-23')).toEqual({
      etapa: 'entregue',
      data_entrega: '2026-09-01',
    });
  });
  it('não mexe em outras etapas', () => {
    expect(aplicarRegrasProjeto(null, { etapa: 'andamento' }, '2026-09-23')).toEqual({ etapa: 'andamento' });
  });
});

describe('aplicarRegrasConteudo', () => {
  it('preenche data_publicada ao marcar publicado', () => {
    expect(aplicarRegrasConteudo({ data_publicada: null }, { status: 'publicado' }, '2026-09-23')).toEqual({
      status: 'publicado',
      data_publicada: '2026-09-23',
    });
  });
  it('mantém data_publicada existente', () => {
    expect(aplicarRegrasConteudo({ data_publicada: '2026-09-01' }, { status: 'publicado' }, '2026-09-23')).toEqual({
      status: 'publicado',
    });
  });
});
