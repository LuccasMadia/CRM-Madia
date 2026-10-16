import { describe, it, expect } from 'vitest';
import { planejarCobrancaUnica } from './cobranca.js';

const aberta = { id: 7, valor_centavos: 5000, vencimento: '2026-10-10', pago_em: null };
const paga = { ...aberta, pago_em: '2026-10-01' };

describe('planejarCobrancaUnica', () => {
  it('cria quando não há parcela, há valor e vencimento', () => {
    expect(planejarCobrancaUnica([], { valorCentavos: 5000, vencimento: '2026-10-10' }))
      .toEqual({ acao: 'criar', valor_centavos: 5000, vencimento: '2026-10-10' });
  });

  it('sem vencimento ou sem valor não cria', () => {
    expect(planejarCobrancaUnica([], { valorCentavos: 5000, vencimento: undefined })).toEqual({ acao: 'nada' });
    expect(planejarCobrancaUnica([], { valorCentavos: 0, vencimento: '2026-10-10' })).toEqual({ acao: 'nada' });
  });

  it('atualiza a parcela aberta, mantendo o vencimento se não vier outro', () => {
    expect(planejarCobrancaUnica([aberta], { valorCentavos: 6000, vencimento: undefined }))
      .toEqual({ acao: 'atualizar', id: 7, valor_centavos: 6000, vencimento: '2026-10-10' });
  });

  it('valor 0 remove a parcela aberta', () => {
    expect(planejarCobrancaUnica([aberta], { valorCentavos: 0, vencimento: undefined })).toEqual({ acao: 'remover', id: 7 });
  });

  it('parcela paga ou várias parcelas avulsas: não mexe', () => {
    expect(planejarCobrancaUnica([paga], { valorCentavos: 9999, vencimento: '2026-12-01' })).toEqual({ acao: 'nada' });
    expect(planejarCobrancaUnica([aberta, { ...aberta, id: 8 }], { valorCentavos: 1, vencimento: '2026-12-01' })).toEqual({ acao: 'nada' });
  });
});
