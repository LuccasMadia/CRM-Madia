import { describe, it, expect } from 'vitest';
import {
  custoUnitarioLote, custoAtualMaterial, estoqueMaterial, custoReceitaModelo,
  lucroPrevisto, lucroRealVenda, resumoLucroReal, materiaisComEstoqueNegativo,
} from './placas.js';

const PLACA = 1;
const ADESIVO_10x10 = 2;
const TAG_NFC = 3;
const PLACA_10x15 = 4;
const ADESIVO_10x15 = 5;
const MODELO_10x10 = 10;
const MODELO_10x15 = 20;

const lotes = [
  { id: 1, material_id: PLACA, quantidade: 10, valor_kit_centavos: 2490, valor_frete_centavos: 0, data_compra: '2026-09-01' },
  { id: 2, material_id: ADESIVO_10x10, quantidade: 81, valor_kit_centavos: 3000, valor_frete_centavos: 0, data_compra: '2026-09-01' },
  { id: 3, material_id: TAG_NFC, quantidade: 50, valor_kit_centavos: 4497, valor_frete_centavos: 0, data_compra: '2026-09-01' },
  { id: 4, material_id: PLACA_10x15, quantidade: 10, valor_kit_centavos: 15000, valor_frete_centavos: 4092, data_compra: '2026-09-01' },
  { id: 5, material_id: ADESIVO_10x15, quantidade: 54, valor_kit_centavos: 3000, valor_frete_centavos: 0, data_compra: '2026-09-01' },
];

const itensModelo = [
  { id: 1, modelo_id: MODELO_10x10, material_id: PLACA, quantidade: 1 },
  { id: 2, modelo_id: MODELO_10x10, material_id: ADESIVO_10x10, quantidade: 1 },
  { id: 3, modelo_id: MODELO_10x10, material_id: TAG_NFC, quantidade: 1 },
  { id: 4, modelo_id: MODELO_10x15, material_id: PLACA_10x15, quantidade: 1 },
  { id: 5, modelo_id: MODELO_10x15, material_id: ADESIVO_10x15, quantidade: 1 },
  { id: 6, modelo_id: MODELO_10x15, material_id: TAG_NFC, quantidade: 1 },
];

describe('custoUnitarioLote', () => {
  it('divide kit + frete pela quantidade, arredondando', () => {
    expect(custoUnitarioLote({ quantidade: 10, valor_kit_centavos: 2490, valor_frete_centavos: 0 })).toBe(249);
    expect(custoUnitarioLote({ quantidade: 81, valor_kit_centavos: 3000, valor_frete_centavos: 0 })).toBe(37);
    expect(custoUnitarioLote({ quantidade: 10, valor_kit_centavos: 15000, valor_frete_centavos: 4092 })).toBe(1909);
  });
});

describe('custoAtualMaterial', () => {
  it('usa o lote mais recente por data_compra', () => {
    const doisLotes = [
      { id: 1, material_id: PLACA, quantidade: 10, valor_kit_centavos: 2490, valor_frete_centavos: 0, data_compra: '2026-09-01' },
      { id: 2, material_id: PLACA, quantidade: 10, valor_kit_centavos: 2600, valor_frete_centavos: 0, data_compra: '2026-10-01' },
    ];
    expect(custoAtualMaterial(PLACA, doisLotes)).toBe(260);
  });

  it('desempata por id quando a data é igual', () => {
    const doisLotes = [
      { id: 1, material_id: PLACA, quantidade: 10, valor_kit_centavos: 2490, valor_frete_centavos: 0, data_compra: '2026-09-01' },
      { id: 2, material_id: PLACA, quantidade: 10, valor_kit_centavos: 2600, valor_frete_centavos: 0, data_compra: '2026-09-01' },
    ];
    expect(custoAtualMaterial(PLACA, doisLotes)).toBe(260);
  });

  it('retorna null quando o material não tem lote', () => {
    expect(custoAtualMaterial(999, lotes)).toBeNull();
  });
});

describe('estoqueMaterial', () => {
  it('soma os lotes e subtrai o consumo das vendas', () => {
    const vendas = [{ modelo_id: MODELO_10x10, quantidade: 3 }];
    expect(estoqueMaterial(ADESIVO_10x10, lotes, vendas, itensModelo)).toBe(81 - 3);
  });

  it('fica negativo quando vende mais do que o estoque', () => {
    const vendas = [{ modelo_id: MODELO_10x10, quantidade: 15 }];
    expect(estoqueMaterial(PLACA, lotes, vendas, itensModelo)).toBe(10 - 15);
  });

  it('ignora vendas de modelo que não usa o material', () => {
    const vendas = [{ modelo_id: MODELO_10x15, quantidade: 5 }];
    expect(estoqueMaterial(PLACA, lotes, vendas, itensModelo)).toBe(10);
  });
});

describe('custoReceitaModelo', () => {
  it('reproduz o custo montado da planilha: placa 10x10 = R$ 3,76', () => {
    expect(custoReceitaModelo(MODELO_10x10, itensModelo, lotes)).toBe(376);
  });

  it('reproduz o custo montado da planilha: placa 10x15 = R$ 20,55', () => {
    expect(custoReceitaModelo(MODELO_10x15, itensModelo, lotes)).toBe(2055);
  });

  it('retorna null se algum material da receita não tem lote', () => {
    const itensSemLote = [{ modelo_id: 99, material_id: 999, quantidade: 1 }];
    expect(custoReceitaModelo(99, itensSemLote, lotes)).toBeNull();
  });

  it('retorna null se o modelo não tem receita', () => {
    expect(custoReceitaModelo(999, itensModelo, lotes)).toBeNull();
  });
});

describe('lucroPrevisto', () => {
  it('reproduz o lucro previsto da planilha: placa 10x10 = R$ 76,24', () => {
    const modelo = { preco_venda_centavos: 8000 };
    expect(lucroPrevisto(modelo, custoReceitaModelo(MODELO_10x10, itensModelo, lotes))).toBe(7624);
  });

  it('reproduz o lucro previsto da planilha: placa 10x15 = R$ 79,45', () => {
    const modelo = { preco_venda_centavos: 10000 };
    expect(lucroPrevisto(modelo, custoReceitaModelo(MODELO_10x15, itensModelo, lotes))).toBe(7945);
  });

  it('retorna null quando o custo não é calculável', () => {
    expect(lucroPrevisto({ preco_venda_centavos: 8000 }, null)).toBeNull();
  });
});

describe('lucroRealVenda e resumoLucroReal', () => {
  const vendas = [
    { modelo_id: MODELO_10x10, quantidade: 1, preco_vendido_centavos: 8000, custo_unitario_centavos: 376 },
    { modelo_id: MODELO_10x10, quantidade: 2, preco_vendido_centavos: 7500, custo_unitario_centavos: 376 },
    { modelo_id: MODELO_10x15, quantidade: 1, preco_vendido_centavos: 10000, custo_unitario_centavos: 2055 },
  ];

  it('lucroRealVenda multiplica pela quantidade', () => {
    expect(lucroRealVenda(vendas[1])).toBe((7500 - 376) * 2);
  });

  it('resumoLucroReal agrupa por modelo com total e média por unidade', () => {
    const resumo = resumoLucroReal(vendas);
    const do10x10 = resumo.find((r) => r.modelo_id === MODELO_10x10);
    expect(do10x10.quantidade).toBe(3);
    expect(do10x10.lucro_total_centavos).toBe((8000 - 376) + (7500 - 376) * 2);
    expect(do10x10.lucro_medio_centavos).toBe(Math.round(do10x10.lucro_total_centavos / 3));

    const do10x15 = resumo.find((r) => r.modelo_id === MODELO_10x15);
    expect(do10x15.quantidade).toBe(1);
    expect(do10x15.lucro_total_centavos).toBe(10000 - 2055);
  });
});

describe('materiaisComEstoqueNegativo', () => {
  it('lista só os materiais com estoque abaixo de zero', () => {
    const materiais = [{ id: PLACA, nome: 'Placa 10x10 PVC' }, { id: ADESIVO_10x10, nome: 'Adesivo 10x10' }];
    const vendas = [{ modelo_id: MODELO_10x10, quantidade: 15 }];
    const resultado = materiaisComEstoqueNegativo(materiais, lotes, vendas, itensModelo);
    expect(resultado.map((m) => m.id)).toEqual([PLACA]);
    expect(resultado[0].estoque_atual).toBe(10 - 15);
  });
});
