import { describe, it, expect } from 'vitest';
import { ETAPAS, ETAPAS_FICTICIO, ROTULO_ETAPA, CATEGORIAS_QR, ROTULO_CATEGORIA_QR, STATUS_QR, ROTULO_STATUS_QR } from './rotulos.js';

describe('ETAPAS_FICTICIO', () => {
  it('só tem andamento e entregue, nessa ordem', () => {
    expect(ETAPAS_FICTICIO).toEqual(['andamento', 'entregue']);
  });

  it('todo item de ETAPAS_FICTICIO existe em ETAPAS e tem rótulo', () => {
    for (const etapa of ETAPAS_FICTICIO) {
      expect(ETAPAS).toContain(etapa);
      expect(ROTULO_ETAPA[etapa]).toBeTruthy();
    }
  });
});

describe('rótulos de QR code', () => {
  it('toda categoria tem rótulo', () => {
    expect(CATEGORIAS_QR).toEqual(['adesivo', 'cardapio', 'panfleto', 'embalagem', 'outro']);
    for (const c of CATEGORIAS_QR) expect(ROTULO_CATEGORIA_QR[c]).toBeTruthy();
  });

  it('status ativo e arquivado, nessa ordem', () => {
    expect(STATUS_QR).toEqual(['ativo', 'arquivado']);
    expect(ROTULO_STATUS_QR.ativo).toBe('Ativo');
    expect(ROTULO_STATUS_QR.arquivado).toBe('Arquivado');
  });
});
