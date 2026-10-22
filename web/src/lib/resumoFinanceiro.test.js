import { describe, it, expect } from 'vitest';
import { montarResumo } from './resumoFinanceiro.js';

const parcela = (extra) => ({ valor_centavos: 10000, servico: 'site_sistema', mensalidade: 0, pago_em: null, estado: 'pendente', vencimento: '2026-12-01', ...extra });
const claude = { cobranca: 'mensalidade', criado_em: '2026-09-02T10:00:00Z', gasto_mes_centavos: 11855 };
const ferramentasPorMes = ['2026-08', '2026-09', '2026-10'].map((mes) => ({ mes, ferramentas: [claude] }));

describe('montarResumo', () => {
  const resumo = montarResumo({
    ano: 2026,
    hoje: '2026-10-21',
    parcelas: [
      parcela({ pago_em: '2026-09-25', estado: 'paga', valor_centavos: 90000 }),
      parcela({ pago_em: '2026-10-01', estado: 'paga', mensalidade: 1, valor_centavos: 20000 }),
      parcela({ pago_em: '2025-12-30', estado: 'paga' }), // outro ano: fica de fora
      parcela({ servico: 'placas_nfc', estado: 'atrasada', vencimento: '2026-09-30', valor_centavos: 8000 }),
      parcela({ estado: 'pendente', vencimento: '2026-11-10', valor_centavos: 20000 }),
      parcela({ estado: 'pendente', vencimento: '2027-02-10', valor_centavos: 20000 }),
    ],
    lotes: [{ data_compra: '2026-10-05', valor_kit_centavos: 15000, valor_frete_centavos: 4092 }],
    ferramentasPorMes,
  });
  const mes = (m) => resumo.meses.find((x) => x.mes === m);

  it('soma receitas por categoria no mês do pagamento, separando mensalidades', () => {
    expect(resumo.receitas.find((c) => c.chave === 'site_sistema').porMes['2026-09']).toBe(90000);
    expect(resumo.receitas.find((c) => c.chave === 'mensalidades').porMes['2026-10']).toBe(20000);
    expect(resumo.totais.receita).toBe(110000);
  });

  it('conta mensalidade de ferramenta só a partir do mês do cadastro e compra de material com frete', () => {
    expect(mes('2026-08').custo).toBe(0);
    expect(mes('2026-09').custo).toBe(11855);
    expect(mes('2026-10').custo).toBe(11855 + 19092);
    expect(resumo.totais.custo).toBe(11855 * 2 + 19092);
  });

  it('calcula resultado, acumulado, margem e média dos meses corridos', () => {
    expect(mes('2026-09').resultado).toBe(90000 - 11855);
    expect(mes('2026-12').acumulado).toBe(resumo.totais.resultado);
    expect(mes('2026-11').futuro).toBe(true);
    expect(resumo.totais.margem).toBeCloseTo(resumo.totais.resultado / 110000);
    expect(resumo.totais.mediaMensal).toBe(11000);
  });

  it('lista o que está em aberto e o que vence nos próximos 30 dias (atrasadas primeiro pela data)', () => {
    expect(resumo.aberto).toEqual({ total: 48000, atrasado: 8000, quantidade: 3 });
    expect(resumo.proximas.map((p) => p.vencimento)).toEqual(['2026-09-30', '2026-11-10']);
  });

  it('sem receita a margem fica indefinida', () => {
    const vazio = montarResumo({ ano: 2026, hoje: '2026-10-21', parcelas: [], lotes: [], ferramentasPorMes: [] });
    expect(vazio.totais.margem).toBeNull();
  });
});
