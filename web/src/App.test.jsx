import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { definirValoresOcultos } from './lib/privacidade.js';
import { MemoryRouter } from 'react-router';
import { App } from './App.jsx';
import { mockApi } from './test/mockApi.js';

const abrir = (rota) => render(<MemoryRouter initialEntries={[rota]}><App /></MemoryRouter>);

describe('App', () => {
  afterEach(() => definirValoresOcultos(false));

  it('Ctrl+Shift+H oculta e mostra os valores da tela aberta', async () => {
    const ano = new Date().getFullYear();
    mockApi({
      'GET /parcelas': [{ id: 1, projeto_id: 5, projeto_titulo: 'Site Ana', cliente_nome: 'Ana', descricao: 'Entrada', valor_centavos: 150000, vencimento: '2026-09-10', estado: 'atrasada', servico: 'site_sistema', cliente_id: 1 }],
      [`GET /financeiro/mensal?ano=${ano}`]: [],
    });
    abrir('/financeiro');
    expect((await screen.findAllByText(/1.500,00/)).length).toBeGreaterThan(0);
    const usuario = userEvent.setup();
    await usuario.keyboard('{Control>}{Shift>}H{/Shift}{/Control}');
    expect(screen.queryByText(/1.500,00/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mostrar valores' })).toBeInTheDocument();
    await usuario.keyboard('{Control>}{Shift>}H{/Shift}{/Control}');
    expect(screen.getAllByText(/1.500,00/).length).toBeGreaterThan(0);
  });

  it('endereço antigo /projetos abre Serviços em Sites e Sistemas', async () => {
    mockApi({ 'GET /projetos?servico=site_sistema': [], 'GET /clientes': [] });
    abrir('/projetos');
    expect(await screen.findByRole('heading', { name: 'Serviços' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Sites e Sistemas/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('endereço antigo /placas abre Serviços em Placas NFC', async () => {
    mockApi({});
    abrir('/placas');
    expect(await screen.findByRole('heading', { name: 'Serviços' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Placas NFC/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('QR codes não têm mais página', () => {
    mockApi({});
    abrir('/qrcodes');
    expect(screen.getByText('Página não encontrada.')).toBeInTheDocument();
  });
});
