import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { Inicio } from './Inicio.jsx';
import { mockApi } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';

describe('Inicio', () => {
  it('mostra cartões e próximos itens, destacando atrasados', async () => {
    mockApi({
      'GET /painel': {
        cartoes: {
          a_receber_mes_centavos: 300000,
          atrasadas: { quantidade: 1, total_centavos: 50000 },
          em_andamento: 2,
          propostas: { quantidade: 1, total_centavos: 800000 },
        },
        proximos: [
          { tipo: 'parcela', id: 3, projeto_id: 5, titulo: 'Entrada', contexto: 'Site Ana', data: '2026-09-20', atrasado: true, valor_centavos: 50000 },
          { tipo: 'conteudo', id: 4, projeto_id: null, titulo: 'Post case', contexto: 'instagram', data: '2026-09-25', atrasado: false },
        ],
      },
    });
    renderizar(<Inicio />);
    expect(await screen.findByText(/3\.000,00/)).toBeInTheDocument();
    expect(screen.getByText(/1 · R\$\s500,00/)).toBeInTheDocument(); // \s cobre o espaço não separável do Intl
    expect(screen.getByRole('link', { name: 'Entrada' })).toHaveAttribute('href', '/projetos/5');
    expect(screen.getByRole('link', { name: 'Post case' })).toHaveAttribute('href', '/conteudo');
    expect(screen.getByText('atrasado')).toBeInTheDocument();
  });

  it('mostra mensagem quando não há nada nos próximos dias', async () => {
    mockApi({
      'GET /painel': {
        cartoes: { a_receber_mes_centavos: 0, atrasadas: { quantidade: 0, total_centavos: 0 }, em_andamento: 0, propostas: { quantidade: 0, total_centavos: 0 } },
        proximos: [],
      },
    });
    renderizar(<Inicio />);
    expect(await screen.findByText('Nada para os próximos 7 dias.')).toBeInTheDocument();
  });
});
