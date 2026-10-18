import { describe, it, expect } from 'vitest';
import { aplicarRegrasProjeto } from './regras.js';

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
    expect(aplicarRegrasProjeto(null, { etapa: 'proposta' }, '2026-09-23')).toEqual({ etapa: 'proposta' });
  });
});

describe('aplicarRegrasProjeto — início automático', () => {
  it('ir para andamento preenche data_inicio vazia', () => {
    expect(aplicarRegrasProjeto({ data_inicio: null }, { etapa: 'andamento' }, '2026-10-16')).toEqual({ etapa: 'andamento', data_inicio: '2026-10-16' });
  });

  it('não sobrescreve data_inicio existente nem a enviada', () => {
    expect(aplicarRegrasProjeto({ data_inicio: '2026-09-01' }, { etapa: 'andamento' }, '2026-10-16')).toEqual({ etapa: 'andamento' });
    expect(aplicarRegrasProjeto(null, { etapa: 'andamento', data_inicio: '2026-01-02' }, '2026-10-16'))
      .toEqual({ etapa: 'andamento', data_inicio: '2026-01-02' });
  });
});
