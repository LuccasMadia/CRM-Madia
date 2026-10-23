import { describe, it, expect } from 'vitest';
import {
  calcularTotais, nomeArquivoPdf, destinosDoItem, destinoPadrao, valoresComDesconto, planejarParcelas, sugerirParcelas,
  alertasOrcamento,
} from './orcamentos.js';

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

describe('aceite', () => {
  it('destinos e destino padrão de cada tipo de item', () => {
    expect(destinosDoItem(item({ tipo_servico: 'placa', valor_unico_centavos: 8000 }))).toEqual(['placa', 'nenhum']);
    expect(destinosDoItem(item({ tipo_servico: 'gmn_config', valor_unico_centavos: 25000 }))).toEqual(['gmn', 'nenhum']);
    expect(destinosDoItem(item({ tipo_servico: 'hospedagem', valor_mensal_centavos: 15000 }))).toEqual(['mensal_site', 'nenhum']);
    expect(destinosDoItem(item({ tipo_servico: 'comum', valor_unico_centavos: 60000 }))).toEqual(['site', 'nenhum']);
    expect(destinosDoItem(item({ tipo_servico: 'comum', valor_mensal_centavos: 15000 }))).toEqual(['mensal_gmn', 'mensal_site', 'nenhum']);
    expect(destinoPadrao(item({ tipo_servico: 'comum', valor_mensal_centavos: 15000 }))).toBe('mensal_gmn');
    expect(destinoPadrao(item({ valor_mensal_centavos: 5000 }))).toBe('mensal_site');
    expect(destinoPadrao(item({}))).toBe('nenhum');
    expect(destinoPadrao(item({ valor_unico_centavos: 100 }))).toBe('site');
  });

  it('divide o desconto proporcionalmente e a soma bate com o total', () => {
    const itens = [
      item({ id: 1, tipo_servico: 'placa', quantidade: 1, valor_unico_centavos: 8000 }),
      item({ id: 2, tipo_servico: 'gmn_config', valor_unico_centavos: 25000 }),
      item({ id: 3, tipo_servico: 'comum', valor_unico_centavos: 150000 }),
      item({ id: 4, tipo_servico: 'hospedagem', valor_mensal_centavos: 15000 }),
    ];
    expect(valoresComDesconto(itens, 18300)).toEqual({ 1: 7200, 2: 22500, 3: 135000 });
    expect(valoresComDesconto(itens, 0)).toEqual({ 1: 8000, 2: 25000, 3: 150000 });
  });

  it('resto dos centavos vai no maior item que aceita centavos; placa fica múltipla da quantidade', () => {
    const itens = [
      item({ id: 1, valor_unico_centavos: 333 }),
      item({ id: 2, valor_unico_centavos: 333 }),
      item({ id: 3, valor_unico_centavos: 334 }),
      item({ id: 4, tipo_servico: 'placa', quantidade: 3, valor_unico_centavos: 2000 }),
    ];
    const valores = valoresComDesconto(itens, 101);
    expect(Object.values(valores).reduce((s, v) => s + v, 0)).toBe(3000 - 101);
    expect(valores[4] % 3).toBe(0);
    // placa sozinha: o que não divide pela quantidade não tem para onde ir (o preço é por placa)
    expect(valoresComDesconto([item({ id: 9, tipo_servico: 'placa', quantidade: 3, valor_unico_centavos: 20000 })], 0)).toEqual({ 9: 20001 });
  });

  it('parcelas de cada atalho', () => {
    expect(planejarParcelas(100000, { modo: 'nenhuma', primeira: '2026-10-21' })).toEqual([]);
    expect(planejarParcelas(0, { modo: 'avista', primeira: '2026-10-21' })).toEqual([]);
    expect(planejarParcelas(100001, { modo: 'entrada_entrega', primeira: '2026-01-31' })).toEqual([
      { descricao: 'Entrada (50%)', valor_centavos: 50000, vencimento: '2026-01-31' },
      { descricao: 'Na entrega (50%)', valor_centavos: 50001, vencimento: '2026-02-28' },
    ]);
    expect(planejarParcelas(1000, { modo: 'mensais', quantidade: 3, primeira: '2026-10-21' }).map((p) => p.valor_centavos)).toEqual([333, 333, 334]);
  });

  it('sugere o atalho pela forma de pagamento escrita', () => {
    expect(sugerirParcelas('À vista no Pix').modo).toBe('avista');
    expect(sugerirParcelas('50% + 50%').modo).toBe('entrada_entrega');
    expect(sugerirParcelas('3x no cartão')).toEqual({ modo: 'mensais', quantidade: 3 });
    expect(sugerirParcelas('a combinar').modo).toBe('avista');
  });

  it('alertas: enviado sem resposta, vencendo, rascunho parado', () => {
    const base = { data: '2026-10-01', validade_dias: 15, situacao: 'enviado' };
    expect(alertasOrcamento(base, '2026-10-14')).toEqual({ vence_em: '2026-10-16', dias_para_vencer: 2, sem_resposta: true, vencendo: true, parado: false });
    expect(alertasOrcamento({ ...base, data: '2026-10-10' }, '2026-10-14')).toMatchObject({ sem_resposta: false, vencendo: false });
    expect(alertasOrcamento({ ...base, situacao: 'rascunho', mexido_em: '2026-10-06' }, '2026-10-14')).toMatchObject({ parado: true, vencendo: false, sem_resposta: false });
    expect(alertasOrcamento({ ...base, situacao: 'rascunho', mexido_em: '2026-10-07' }, '2026-10-14').parado).toBe(false);
  });
});
