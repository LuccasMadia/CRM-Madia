import { describe, it, expect } from 'vitest';
import userEvent from '@testing-library/user-event';
import { Route, Routes, MemoryRouter } from 'react-router';
import { render, screen } from '@testing-library/react';
import { AbaOrcamentos } from './AbaOrcamentos.jsx';
import { ClienteDetalhe } from '../ClienteDetalhe.jsx';
import { mockApi } from '../../test/mockApi.js';
import { renderizar } from '../../test/renderizar.jsx';
import { rotasPerfil, clienteExemplo } from '../../test/perfilCliente.js';

const totais = (unico, mensal) => ({
  servicos_combo: 0, subtotal_unico_centavos: unico, desconto_centavos: 0, total_unico_centavos: unico,
  mensalidades: mensal ? [{ nome: 'Hospedagem', valor_centavos: mensal }] : [], total_mensal_centavos: mensal,
});

describe('AbaOrcamentos', () => {
  it('lista orçamentos e cria um novo indo para a página dele', async () => {
    const { chamadas } = mockApi({
      'GET /clientes/1/orcamentos': [
        { id: 7, numero: 7, data: '2026-10-21', situacao: 'enviado', totais: totais(164700, 15000) },
        { id: 3, numero: 3, data: '2026-09-02', situacao: 'rascunho', totais: totais(60000, 0) },
      ],
      'POST /clientes/1/orcamentos': { id: 12, numero: 12 },
    });
    render(
      <MemoryRouter initialEntries={['/clientes/1']}>
        <Routes>
          <Route path="/clientes/:id" element={<AbaOrcamentos cliente={clienteExemplo} />} />
          <Route path="/orcamentos/:id" element={<p>Página do orçamento</p>} />
        </Routes>
      </MemoryRouter>,
    );
    const linha = await screen.findByRole('link', { name: /nº 007/ });
    expect(linha).toHaveTextContent(/nº 007 · 21\/10\/2026 · Enviado · R\$\s1\.647,00 \+ R\$\s150,00\/mês/);
    expect(linha).toHaveAttribute('href', '/orcamentos/7');
    const outra = screen.getByRole('link', { name: /nº 003/ });
    expect(outra).toHaveTextContent(/nº 003 · 02\/09\/2026 · Rascunho · R\$\s600,00$/);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Novo orçamento' }));
    expect(await screen.findByText('Página do orçamento')).toBeInTheDocument();
    expect(chamadas.find((c) => c.metodo === 'POST').caminho).toBe('/clientes/1/orcamentos');
  });

  it('aba Orçamentos aparece no perfil', async () => {
    mockApi(rotasPerfil({ 'GET /clientes/1/orcamentos': [] }));
    renderizar(<ClienteDetalhe />, { rota: '/clientes/1', padrao: '/clientes/:id' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Orçamentos' }));
    expect(screen.getByRole('tab', { name: 'Orçamentos' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('Nenhum orçamento ainda.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Novo orçamento' })).toBeInTheDocument();
  });
});
