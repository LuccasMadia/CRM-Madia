import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { App } from './App.jsx';
import { mockApi } from './test/mockApi.js';

const abrir = (rota) => render(<MemoryRouter initialEntries={[rota]}><App /></MemoryRouter>);

describe('App', () => {
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
