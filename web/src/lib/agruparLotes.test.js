import { describe, it, expect } from 'vitest';
import { agruparLotesPorNome, nomesLoteDistintos } from './agruparLotes.js';

const lote = (overrides) => ({
  id: 1, material_id: 1, nome_lote: '', quantidade: 10,
  valor_kit_centavos: 1000, valor_frete_centavos: 100, data_compra: '2026-10-01',
  ...overrides,
});

describe('agruparLotesPorNome', () => {
  it('agrupa lotes com o mesmo nome_lote e soma kit+frete', () => {
    const lotes = [
      lote({ id: 1, nome_lote: 'Compra Outubro', valor_kit_centavos: 1000, valor_frete_centavos: 100, data_compra: '2026-10-05' }),
      lote({ id: 2, nome_lote: 'Compra Outubro', valor_kit_centavos: 2000, valor_frete_centavos: 200, data_compra: '2026-10-08' }),
    ];
    const [grupo] = agruparLotesPorNome(lotes);
    expect(grupo).toMatchObject({
      tipo: 'grupo', nomeLote: 'Compra Outubro',
      dataMin: '2026-10-05', dataMax: '2026-10-08', totalCentavos: 3300,
    });
    expect(grupo.itens.map((i) => i.id)).toEqual([1, 2]);
  });

  it('grupo com um único item tem dataMin igual a dataMax', () => {
    const lotes = [lote({ id: 1, nome_lote: 'Compra Única', data_compra: '2026-10-05' })];
    const [grupo] = agruparLotesPorNome(lotes);
    expect(grupo.dataMin).toBe('2026-10-05');
    expect(grupo.dataMax).toBe('2026-10-05');
  });

  it('lotes sem nome_lote (vazio ou só espaços) ficam soltos', () => {
    const lotes = [
      lote({ id: 1, nome_lote: '' }),
      lote({ id: 2, nome_lote: '   ' }),
      lote({ id: 3, nome_lote: null }),
    ];
    const entradas = agruparLotesPorNome(lotes);
    expect(entradas).toHaveLength(3);
    expect(entradas.every((e) => e.tipo === 'solto')).toBe(true);
  });

  it('nomes diferentes (maiúsculas/espaços) não se misturam no mesmo grupo', () => {
    const lotes = [
      lote({ id: 1, nome_lote: 'Compra Outubro' }),
      lote({ id: 2, nome_lote: 'compra outubro' }),
    ];
    const entradas = agruparLotesPorNome(lotes);
    expect(entradas.filter((e) => e.tipo === 'grupo')).toHaveLength(2);
  });

  it('ordena grupos e soltos juntos pela data mais recente de cada entrada', () => {
    const lotes = [
      lote({ id: 1, nome_lote: 'Grupo Antigo', data_compra: '2026-09-01' }),
      lote({ id: 2, nome_lote: '', data_compra: '2026-10-10' }),
      lote({ id: 3, nome_lote: 'Grupo Recente', data_compra: '2026-10-15' }),
    ];
    const entradas = agruparLotesPorNome(lotes);
    expect(entradas.map((e) => (e.tipo === 'grupo' ? e.nomeLote : `solto-${e.lote.id}`)))
      .toEqual(['Grupo Recente', 'solto-2', 'Grupo Antigo']);
  });
});

describe('nomesLoteDistintos', () => {
  it('retorna nomes distintos, não vazios, ordenados alfabeticamente', () => {
    const lotes = [
      lote({ nome_lote: 'Compra Outubro' }),
      lote({ nome_lote: 'Compra Outubro' }),
      lote({ nome_lote: 'Compra Agosto' }),
      lote({ nome_lote: '' }),
      lote({ nome_lote: null }),
    ];
    expect(nomesLoteDistintos(lotes)).toEqual(['Compra Agosto', 'Compra Outubro']);
  });
});
