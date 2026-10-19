import { describe, it, expect } from 'vitest';
import { situacaoCobranca, PRAZO_PADRAO_DIAS } from './cobranca.js';

const HOJE = '2026-11-20';
const projeto = { ficticio: 0, mensalidade_ativa: 1 };
const vercel = { tipo: 'vercel', status: 'no_ar', cliente_avisado_em: null };
const parcela = (vencimento, extra = {}) => ({
  mensalidade: 1,
  pago_em: null,
  vencimento,
  valor_centavos: 5000,
  ...extra,
});
const calcular = (o = {}) =>
  situacaoCobranca({
    projeto,
    hospedagem: vercel,
    parcelas: [],
    hoje: HOJE,
    prazoDias: 7,
    ...o,
  });

describe('situacaoCobranca', () => {
  it('exporta o prazo padrao de 7 dias', () => {
    expect(PRAZO_PADRAO_DIAS).toBe(7);
  });

  it('atrasada sem aviso', () => {
    expect(calcular({ parcelas: [parcela('2026-11-10')] })).toEqual({
      fase: 'atrasada',
      atrasada_desde: '2026-11-10',
      valor_centavos: 5000,
      avisado_em: null,
      prazo_ate: null,
    });
  });

  it('vencimento hoje nao e atraso', () => {
    expect(calcular({ parcelas: [parcela(HOJE)] })).toBeNull();
  });

  it('avisado dentro do prazo', () => {
    const r = calcular({
      parcelas: [parcela('2026-11-10')],
      hospedagem: { ...vercel, cliente_avisado_em: '2026-11-15' },
    });
    expect(r).toMatchObject({ fase: 'avisado', prazo_ate: '2026-11-22', avisado_em: '2026-11-15' });
  });

  it('prazo vencido no dia do prazo', () => {
    const r = calcular({
      parcelas: [parcela('2026-11-10')],
      hospedagem: { ...vercel, cliente_avisado_em: '2026-11-13' },
    });
    expect(r).toMatchObject({ fase: 'prazo_vencido', prazo_ate: HOJE });
  });

  it('pagamento parcial mantem o aviso com o valor restante', () => {
    const r = calcular({
      parcelas: [
        parcela('2026-10-10', { pago_em: '2026-11-18', valor_centavos: 3000 }),
        parcela('2026-11-10', { valor_centavos: 4000 }),
      ],
      hospedagem: { ...vercel, cliente_avisado_em: '2026-11-15' },
    });
    expect(r).toMatchObject({
      fase: 'avisado',
      atrasada_desde: '2026-11-10',
      valor_centavos: 4000,
      avisado_em: '2026-11-15',
    });
  });

  it('soma varias atrasadas e usa o menor vencimento', () => {
    const r = calcular({ parcelas: [parcela('2026-11-10'), parcela('2026-10-10')] });
    expect(r).toMatchObject({ atrasada_desde: '2026-10-10', valor_centavos: 10000 });
  });

  it('ficticio, sem hospedagem e nao-mensalidade dao null', () => {
    const p = [parcela('2026-11-10')];
    expect(calcular({ projeto: { ...projeto, ficticio: 1 }, parcelas: p })).toBeNull();
    expect(calcular({ hospedagem: { ...vercel, tipo: 'sem_hospedagem' }, parcelas: p })).toBeNull();
    expect(calcular({ hospedagem: null, parcelas: p })).toBeNull();
    expect(calcular({ parcelas: [parcela('2026-11-10', { mensalidade: 0 })] })).toBeNull();
  });

  it('pago_pausado e pausado_atrasado', () => {
    const pausado = { ...vercel, status: 'pausado' };
    expect(calcular({ hospedagem: pausado })).toEqual({
      fase: 'pago_pausado',
      atrasada_desde: null,
      valor_centavos: 0,
      avisado_em: null,
      prazo_ate: null,
    });
    expect(calcular({ hospedagem: pausado, parcelas: [parcela('2026-11-10')] })).toMatchObject({
      fase: 'pausado_atrasado',
      atrasada_desde: '2026-11-10',
      valor_centavos: 5000,
    });
    expect(calcular({ hospedagem: pausado, projeto: { ...projeto, mensalidade_ativa: 0 } })).toBeNull();
  });
});
