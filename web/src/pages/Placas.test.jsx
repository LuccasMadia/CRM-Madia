import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { Placas } from './Placas.jsx';
import { mockApi } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';

describe('Placas', () => {
  it('mostra o resumo de lucro previsto, lucro real e estoque', async () => {
    mockApi({
      'GET /placas/resumo': {
        lucro_previsto_por_modelo: [
          { modelo_id: 1, modelo_nome: 'Placa 10x10 PVC', preco_venda_centavos: 8000, custo_previsto_centavos: 376, lucro_previsto_centavos: 7624 },
        ],
        lucro_real_por_modelo: [
          { modelo_id: 1, modelo_nome: 'Placa 10x10 PVC', quantidade: 2, lucro_total_centavos: 15000, lucro_medio_centavos: 7500 },
        ],
        materiais: [{ material_id: 1, nome: 'Placa 10x10 PVC', estoque_atual: -1 }],
      },
    });
    renderizar(<Placas />, { rota: '/placas', padrao: '/placas' });
    expect(await screen.findByRole('heading', { name: 'Placas de avaliação' })).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*76,24/)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*75,00/)).toBeInTheDocument();
    expect(screen.getByText('-1')).toBeInTheDocument();
  });
});
