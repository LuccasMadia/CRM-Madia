import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Financeiro } from './Financeiro.jsx';
import { mockApi } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';
import { hojeISO } from '../lib/datas.js';

const ano = hojeISO().slice(0, 4);
const meses = Array.from({ length: 12 }, (_, i) => ({ mes: `${ano}-${String(i + 1).padStart(2, '0')}`, recebido_centavos: i === 8 ? 450000 : 0 }));
const parcela = {
  id: 1, projeto_id: 5, projeto_titulo: 'Site Ana', cliente_nome: 'Ana', descricao: 'Entrada',
  valor_centavos: 150000, vencimento: '2026-09-10', estado: 'atrasada',
};

describe('Financeiro', () => {
  it('lista parcelas, total e recebido por mês; filtra por estado', async () => {
    const { chamadas } = mockApi({
      'GET /parcelas': [parcela],
      'GET /parcelas?estado=atrasada': [parcela],
      [`GET /financeiro/mensal?ano=${ano}`]: meses,
    });
    renderizar(<Financeiro />, { rota: '/financeiro', padrao: '/financeiro' });
    expect(await screen.findByRole('link', { name: 'Site Ana' })).toHaveAttribute('href', '/projetos/5');
    expect(await screen.findByText(/4\.500,00/)).toBeInTheDocument();
    await userEvent.setup().selectOptions(screen.getByLabelText('Estado'), 'atrasada');
    await screen.findByRole('link', { name: 'Site Ana' });
    expect(chamadas.map((c) => c.caminho)).toContain('/parcelas?estado=atrasada');
  });
});
