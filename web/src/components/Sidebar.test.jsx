import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { Sidebar } from './Sidebar.jsx';
import { definirValoresOcultos } from '../lib/privacidade.js';

function renderizarSidebar() {
  return render(<MemoryRouter><Sidebar /></MemoryRouter>);
}

describe('Sidebar', () => {
  beforeEach(() => {
    localStorage.clear();
    definirValoresOcultos(false);
  });

  it('começa aberta, com ícone e nome de cada item', () => {
    renderizarSidebar();
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(nav).not.toHaveClass('sidebar--recolhida');
    expect(screen.getByRole('link', { name: 'Funil' })).toBeInTheDocument();
    expect(screen.getByText('Configurações')).toBeVisible();
    expect(nav.querySelectorAll('a svg')).toHaveLength(8);
  });

  it('serviços ficam num item só, sem Projetos, Placas e QR Codes', () => {
    renderizarSidebar();
    const rotulos = screen.getAllByRole('link').map((l) => l.getAttribute('aria-label'));
    expect(rotulos).toEqual(['Início', 'Funil', 'Clientes', 'Serviços', 'Conteúdo', 'Portfólio', 'Financeiro', 'Configurações']);
    expect(screen.getByRole('link', { name: 'Serviços' })).toHaveAttribute('href', '/servicos');
  });

  it('recolher deixa só os ícones, com o nome como dica', async () => {
    renderizarSidebar();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Recolher menu' }));
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(nav).toHaveClass('sidebar--recolhida');
    const link = screen.getByRole('link', { name: 'Funil' });
    expect(link).toHaveAttribute('title', 'Funil');
    expect(screen.getByRole('button', { name: 'Expandir menu' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('lembra a escolha entre aberturas', async () => {
    const { unmount } = renderizarSidebar();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Recolher menu' }));
    unmount();
    renderizarSidebar();
    expect(screen.getByRole('navigation', { name: 'Principal' })).toHaveClass('sidebar--recolhida');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Expandir menu' }));
    expect(screen.getByRole('navigation', { name: 'Principal' })).not.toHaveClass('sidebar--recolhida');
    expect(localStorage.getItem('crm.sidebarRecolhida')).toBe('0');
  });

  it('botão de olho oculta e mostra os valores e lembra a escolha', async () => {
    renderizarSidebar();
    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole('button', { name: 'Ocultar valores' }));
    expect(screen.getByRole('button', { name: 'Mostrar valores' })).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('crm.valoresOcultos')).toBe('1');
    await usuario.click(screen.getByRole('button', { name: 'Mostrar valores' }));
    expect(screen.getByRole('button', { name: 'Ocultar valores' })).toHaveAttribute('aria-pressed', 'false');
    expect(localStorage.getItem('crm.valoresOcultos')).toBe('0');
  });

  it('funciona mesmo se o localStorage falhar', async () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new Error('bloqueado'); };
    try {
      renderizarSidebar();
      expect(screen.getByRole('navigation', { name: 'Principal' })).not.toHaveClass('sidebar--recolhida');
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});
