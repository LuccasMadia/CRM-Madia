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

  it('começa recolhida, só com os ícones e o nome como dica', () => {
    renderizarSidebar();
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(nav).toHaveClass('sidebar--recolhida');
    expect(screen.getByRole('link', { name: 'Clientes' })).toHaveAttribute('title', 'Clientes');
    expect(nav.querySelectorAll('a svg')).toHaveLength(7);
  });

  it('começa recolhida mesmo com uma escolha antiga salva', () => {
    localStorage.setItem('crm.sidebarRecolhida', '0');
    renderizarSidebar();
    expect(screen.getByRole('navigation', { name: 'Principal' })).toHaveClass('sidebar--recolhida');
  });

  it('passar o mouse expande por cima do conteúdo e tirar o mouse recolhe', async () => {
    renderizarSidebar();
    const usuario = userEvent.setup();
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    await usuario.hover(nav);
    expect(nav).not.toHaveClass('sidebar--recolhida');
    expect(nav).toHaveClass('sidebar--flutuante');
    expect(screen.getByRole('link', { name: 'Clientes' })).not.toHaveAttribute('title');
    await usuario.unhover(nav);
    expect(nav).toHaveClass('sidebar--recolhida');
  });

  it('o botão fixa o menu aberto e solta de novo', async () => {
    renderizarSidebar();
    const usuario = userEvent.setup();
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    await usuario.click(screen.getByRole('button', { name: 'Fixar menu aberto' }));
    await usuario.unhover(nav);
    expect(nav).not.toHaveClass('sidebar--recolhida');
    expect(nav).not.toHaveClass('sidebar--flutuante');
    expect(screen.getByRole('button', { name: 'Recolher menu' })).toHaveAttribute('aria-pressed', 'true');
    await usuario.click(screen.getByRole('button', { name: 'Recolher menu' }));
    await usuario.unhover(nav);
    expect(nav).toHaveClass('sidebar--recolhida');
  });

  it('serviços ficam num item só, sem Projetos, Placas e QR Codes', () => {
    renderizarSidebar();
    const rotulos = screen.getAllByRole('link').map((l) => l.getAttribute('aria-label'));
    expect(rotulos).toEqual(['Início', 'Clientes', 'Serviços', 'Conteúdo', 'Portfólio', 'Financeiro', 'Configurações']);
    expect(screen.getByRole('link', { name: 'Serviços' })).toHaveAttribute('href', '/servicos');
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
      expect(screen.getByRole('navigation', { name: 'Principal' })).toHaveClass('sidebar--recolhida');
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});
