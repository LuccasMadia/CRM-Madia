import { describe, it, expect } from 'vitest';
import { ultimosMeses, montarFunil, recebidoPorMes, agruparOrigens, faturamentoPorServico } from './graficos.js';

const site = (etapa) => ({ etapa, servico: 'site_sistema' });

describe('ultimosMeses', () => {
  it('conta para trás a partir do mês de hoje, atravessando o ano', () => {
    expect(ultimosMeses('2027-02-10', 6)).toEqual(['2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02']);
  });
});

describe('montarFunil', () => {
  it('conta cumulativo: cada projeto entra em todas as etapas até a dele', () => {
    const r = montarFunil([site('ideia'), site('valor_definido'), site('andamento'), site('entregue'), site('entregue')]);
    expect(r.etapas).toEqual([
      { etapa: 'ideia', quantidade: 5, percentual: 100 },
      { etapa: 'apresentado', quantidade: 4, percentual: 80 },
      { etapa: 'valor_definido', quantidade: 4, percentual: 80 },
      { etapa: 'teste', quantidade: 3, percentual: 60 },
      { etapa: 'andamento', quantidade: 3, percentual: 60 },
      { etapa: 'entregue', quantidade: 2, percentual: 40 },
    ]);
    expect(r.perdidos).toBe(0);
  });

  it('perdido conta só em ideia e em perdidos', () => {
    const r = montarFunil([site('perdido'), site('valor_definido')]);
    expect(r.etapas.map((e) => e.quantidade)).toEqual([2, 1, 1, 0, 0, 0]);
    expect(r.perdidos).toBe(1);
  });

  it('só com perdidos não divide por zero', () => {
    const r = montarFunil([site('perdido'), site('perdido')]);
    expect(r.etapas.map((e) => e.quantidade)).toEqual([2, 0, 0, 0, 0, 0]);
    expect(r.etapas.map((e) => e.percentual)).toEqual([100, 0, 0, 0, 0, 0]);
  });

  it('sem projetos fica tudo zero', () => {
    const r = montarFunil([]);
    expect(r.etapas.map((e) => [e.quantidade, e.percentual])).toEqual([[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]]);
    expect(r.perdidos).toBe(0);
  });

  it('ignora GMN e placas', () => {
    const r = montarFunil([
      site('entregue'),
      { etapa: 'entregue', servico: 'google_meu_negocio' },
      { etapa: 'andamento', servico: 'placas_nfc' },
    ]);
    expect(r.etapas[0].quantidade).toBe(1);
  });

  it('arredonda o percentual', () => {
    const r = montarFunil([site('ideia'), site('ideia'), site('valor_definido')]);
    expect(r.etapas[1].percentual).toBe(33);
  });

  it('protótipo é opcional: conta só como ideia', () => {
    const r = montarFunil([site('prototipo'), site('teste')]);
    expect(r.etapas.map((e) => e.quantidade)).toEqual([2, 1, 1, 1, 0, 0]);
  });
});

describe('recebidoPorMes', () => {
  it('soma por mês de pagamento, com zeros nos meses vazios', () => {
    const r = recebidoPorMes([
      { valor_centavos: 1000, pago_em: '2026-10-05' },
      { valor_centavos: 500, pago_em: '2026-10-20' },
      { valor_centavos: 300, pago_em: '2026-07-01' },
      { valor_centavos: 999, pago_em: null },
      { valor_centavos: 777, pago_em: '2026-04-30' },
      { valor_centavos: 888, pago_em: '2026-11-02' },
    ], '2026-10-16');
    expect(r).toEqual([
      { mes: '2026-05', total_centavos: 0 },
      { mes: '2026-06', total_centavos: 0 },
      { mes: '2026-07', total_centavos: 300 },
      { mes: '2026-08', total_centavos: 0 },
      { mes: '2026-09', total_centavos: 0 },
      { mes: '2026-10', total_centavos: 1500 },
    ]);
  });
});

describe('agruparOrigens', () => {
  it('agrupa ignorando maiúsculas e espaços e usa a grafia mais comum', () => {
    const r = agruparOrigens([
      { origem: 'Instagram' }, { origem: ' instagram ' }, { origem: 'Instagram' },
      { origem: '' }, { origem: null }, { origem: 'Indicação' },
    ]);
    expect(r).toEqual({
      total: 6,
      fatias: [
        { nome: 'Instagram', quantidade: 3 },
        { nome: 'Não informado', quantidade: 2 },
        { nome: 'Indicação', quantidade: 1 },
      ],
    });
  });

  it('mantém as 4 maiores e junta o resto em Outros', () => {
    const origens = ['A', 'A', 'A', 'A', 'A', 'B', 'B', 'B', 'B', 'C', 'C', 'C', 'D', 'D', 'E', 'F'];
    const r = agruparOrigens(origens.map((origem) => ({ origem })));
    expect(r.total).toBe(16);
    expect(r.fatias).toEqual([
      { nome: 'A', quantidade: 5 },
      { nome: 'B', quantidade: 4 },
      { nome: 'C', quantidade: 3 },
      { nome: 'D', quantidade: 2 },
      { nome: 'Outros', quantidade: 2 },
    ]);
  });

  it('sem clientes devolve total zero e nenhuma fatia', () => {
    expect(agruparOrigens([])).toEqual({ total: 0, fatias: [] });
  });
});

describe('faturamentoPorServico', () => {
  it('soma parcelas pagas dos últimos 12 meses por serviço, sempre com os 3', () => {
    const r = faturamentoPorServico([
      { valor_centavos: 1000, pago_em: '2026-10-01', servico: 'site_sistema' },
      { valor_centavos: 2000, pago_em: '2025-11-01', servico: 'site_sistema' },
      { valor_centavos: 4000, pago_em: '2025-10-31', servico: 'site_sistema' },
      { valor_centavos: 500, pago_em: '2026-03-10', servico: 'google_meu_negocio' },
      { valor_centavos: 900, pago_em: null, servico: 'placas_nfc' },
      { valor_centavos: 700, pago_em: '2026-12-01', servico: 'placas_nfc' },
    ], '2026-10-16');
    expect(r).toEqual([
      { servico: 'site_sistema', total_centavos: 3000 },
      { servico: 'google_meu_negocio', total_centavos: 500 },
      { servico: 'placas_nfc', total_centavos: 0 },
    ]);
  });
});
