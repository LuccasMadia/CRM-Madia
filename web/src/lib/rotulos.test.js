import { describe, it, expect } from 'vitest';
import {
  ETAPAS, ETAPAS_FICTICIO, ROTULO_ETAPA, ROTULO_ESTADO_CONTEUDO,
  TIPOS_SERVICO, ROTULO_TIPO_SERVICO, ROTULO_SERVICO, SERVICOS, ABA_DO_SERVICO,
} from './rotulos.js';

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

describe('rótulos de serviço', () => {
  it('tem os 2 tipos fixos, cada um com rótulo', () => {
    expect(TIPOS_SERVICO).toEqual(['placas_nfc', 'google_meu_negocio']);
    for (const tipo of TIPOS_SERVICO) expect(ROTULO_TIPO_SERVICO[tipo]).toBeTruthy();
  });
});

describe('rótulos de serviço', () => {
  it('três serviços com rótulo e aba', () => {
    expect(SERVICOS).toEqual(['site_sistema', 'google_meu_negocio', 'placas_nfc']);
    for (const s of SERVICOS) {
      expect(ROTULO_SERVICO[s]).toBeTruthy();
      expect(ABA_DO_SERVICO[s]).toBeTruthy();
    }
  });
});

describe("ROTULO_ESTADO_CONTEUDO", () => {
  it("tem rotulo para os estados de publicacao", () => {
    for (const e of ["rascunho", "pronto", "agendado", "publicando", "publicado", "falhou", "atrasado"]) {
      expect(ROTULO_ESTADO_CONTEUDO[e]).toBeTruthy();
    }
  });
});
