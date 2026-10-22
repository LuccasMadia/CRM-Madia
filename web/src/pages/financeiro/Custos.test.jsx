import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import { Custos } from './Custos.jsx';
import { mockApi } from '../../test/mockApi.js';
import { renderizar } from '../../test/renderizar.jsx';
import { hojeISO } from '../../lib/datas.js';

const mes = hojeISO().slice(0, 7);

describe('Custos', () => {
  it('mostra as ferramentas e as compras de material com kit + frete, mais recentes primeiro', async () => {
    mockApi({
      [`GET /ferramentas?mes=${mes}`]: { mes, ferramentas: [], total_mes_centavos: 0 },
      'GET /placas/materiais': [{ id: 1, nome: 'Placa 10x10 PVC' }, { id: 2, nome: 'Adesivo 10x10' }],
      'GET /placas/lotes': [
        { id: 1, material_id: 1, nome_lote: 'Lote 01', quantidade: 50, valor_kit_centavos: 2719, valor_frete_centavos: 0, data_compra: '2026-09-15' },
        { id: 2, material_id: 2, nome_lote: null, quantidade: 10, valor_kit_centavos: 15000, valor_frete_centavos: 4092, data_compra: '2026-10-05' },
      ],
    });
    renderizar(<Custos />);
    expect(await screen.findByText('Nenhuma ferramenta cadastrada.')).toBeInTheDocument();
    const linhas = (await screen.findAllByRole('row')).filter((r) => r.closest('.tabela--compras'));
    expect(linhas[1]).toHaveTextContent('Adesivo 10x10');
    expect(within(linhas[1]).getByText(/190,92/)).toBeInTheDocument();
    expect(linhas[2]).toHaveTextContent('Placa 10x10 PVC');
    expect(screen.getByRole('row', { name: /^Total/ })).toHaveTextContent('218,11');
    expect(screen.getByRole('link', { name: 'Gerenciar em Placas' })).toHaveAttribute('href', '/servicos?aba=placas&placas=materiais');
  });
});
