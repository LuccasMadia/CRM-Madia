import { describe, it, expect } from 'vitest';
import { tarefaVencida, entregueRelevante, SERVICOS_ORDEM } from './cerebro.js';

describe('tarefaVencida', () => {
  const hoje = '2026-09-23';
  it('vence só com prazo de data real e menor que hoje', () => {
    expect(tarefaVencida({ concluida: 0, prazo: '2026-09-22' }, hoje)).toBe(true);
    expect(tarefaVencida({ concluida: 0, prazo: '2026-09-23' }, hoje)).toBe(false);
    expect(tarefaVencida({ concluida: 0, prazo: null }, hoje)).toBe(false);
    expect(tarefaVencida({ concluida: 0, prazo: 'sexta' }, hoje)).toBe(false);
    expect(tarefaVencida({ concluida: 1, prazo: '2026-09-22' }, hoje)).toBe(false);
  });
});

describe('entregueRelevante', () => {
  const hoje = '2026-09-23';
  const nada = { tarefasAbertas: 0, parcelasAbertas: 0 };
  it('entra nos últimos 30 dias (inclusive) ou com pendência', () => {
    expect(entregueRelevante({ data_entrega: '2026-08-25' }, nada, hoje)).toBe(true);
    expect(entregueRelevante({ data_entrega: '2026-08-24' }, nada, hoje)).toBe(true);
    expect(entregueRelevante({ data_entrega: '2026-08-20' }, nada, hoje)).toBe(false);
    expect(entregueRelevante({ data_entrega: '2026-08-20' }, { ...nada, parcelasAbertas: 1 }, hoje)).toBe(true);
    expect(entregueRelevante({ data_entrega: null }, nada, hoje)).toBe(false);
  });
});

it('SERVICOS_ORDEM tem os três serviços na ordem do relatório', () => {
  expect(SERVICOS_ORDEM).toEqual(['site_sistema', 'google_meu_negocio', 'placas_nfc']);
});
