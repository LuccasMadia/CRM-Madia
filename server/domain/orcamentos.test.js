import { describe, it, expect } from 'vitest';
import { calcularTotais, nomeArquivoPdf } from './orcamentos.js';

let seq = 0;
const item = (o) => ({
  id: ++seq, servico_id: null, tipo_servico: null, nome: 'Item',
  valor_unico_centavos: 0, valor_mensal_centavos: 0, ...o,
});

describe('calcularTotais', () => {
  it('Filinto: placa + GMN + cardápio dá 10% sobre 1830 e mensalidade separada', () => {
    const itens = [
      item({ servico_id: 1, tipo_servico: 'placa', nome: 'Placa NFC', valor_unico_centavos: 8000 }),
      item({ servico_id: 2, tipo_servico: 'gmn_config', nome: 'GMN', valor_unico_centavos: 25000 }),
      item({ servico_id: 3, tipo_servico: 'sistema', nome: 'Cardápio', valor_unico_centavos: 150000 }),
      item({ servico_id: 4, tipo_servico: 'hospedagem', nome: 'Hospedagem e suporte', valor_mensal_centavos: 15000 }),
    ];
    expect(calcularTotais(itens, 10)).toEqual({
      servicos_combo: 3,
      subtotal_unico_centavos: 183000,
      desconto_centavos: 18300,
      total_unico_centavos: 164700,
      mensalidades: [{ nome: 'Hospedagem e suporte', valor_centavos: 15000 }],
      total_mensal_centavos: 15000,
    });
  });

  it('landing page + hospedagem não tem desconto (mensalidade não conta)', () => {
    const r = calcularTotais([
      item({ servico_id: 5, tipo_servico: 'site', valor_unico_centavos: 60000 }),
      item({ servico_id: 4, tipo_servico: 'hospedagem', nome: 'Hospedagem', valor_mensal_centavos: 5000 }),
    ], 10);
    expect(r.servicos_combo).toBe(1);
    expect(r.desconto_centavos).toBe(0);
  });

  it('duas placas de modelos diferentes contam como um serviço', () => {
    const p1 = item({ servico_id: 1, tipo_servico: 'placa', valor_unico_centavos: 8000 });
    const p2 = item({ servico_id: 9, tipo_servico: 'placa', valor_unico_centavos: 9000 });
    const gmn = item({ servico_id: 2, tipo_servico: 'gmn_config', valor_unico_centavos: 25000 });
    const com = calcularTotais([p1, p2, gmn], 10);
    expect(com.servicos_combo).toBe(2);
    expect(com.desconto_centavos).toBe(4200);
    const so = calcularTotais([p1, p2], 10);
    expect(so.servicos_combo).toBe(1);
    expect(so.desconto_centavos).toBe(0);
  });

  it('dois itens livres contam como dois serviços', () => {
    const r = calcularTotais([
      item({ valor_unico_centavos: 1000 }),
      item({ valor_unico_centavos: 2000 }),
    ], 10);
    expect(r.servicos_combo).toBe(2);
    expect(r.desconto_centavos).toBe(300);
  });

  it('desconto_pct null não dá desconto; 15 dá 15%', () => {
    const itens = [item({ valor_unico_centavos: 10000 }), item({ valor_unico_centavos: 10000 })];
    expect(calcularTotais(itens, null).desconto_centavos).toBe(0);
    expect(calcularTotais(itens, null).total_unico_centavos).toBe(20000);
    expect(calcularTotais(itens, 15).desconto_centavos).toBe(3000);
  });

  it('orçamento vazio dá tudo zero e nenhuma mensalidade', () => {
    expect(calcularTotais([], 10)).toEqual({
      servicos_combo: 0,
      subtotal_unico_centavos: 0,
      desconto_centavos: 0,
      total_unico_centavos: 0,
      mensalidades: [],
      total_mensal_centavos: 0,
    });
  });
});

describe('nomeArquivoPdf', () => {
  it('monta o nome sem acento nem símbolo', () => {
    expect(nomeArquivoPdf(7, 'Filinto Sorvetes')).toBe('Orcamento-007-Filinto-Sorvetes.pdf');
    expect(nomeArquivoPdf(12, 'Açaí & Cia/SP')).toBe('Orcamento-012-Acai-Cia-SP.pdf');
    expect(nomeArquivoPdf(1234, '***')).toBe('Orcamento-1234-cliente.pdf');
  });
});
