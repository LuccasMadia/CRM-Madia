import { describe, it, expect } from 'vitest';
import { ETAPAS, ETAPAS_FICTICIO, ROTULO_ETAPA } from './rotulos.js';

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
