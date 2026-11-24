import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { Sidebar } from './Sidebar.jsx';
import { definirValoresOcultos } from '../lib/privacidade.js';

function renderizarSidebar() {
  return render(<MemoryRouter><Sidebar /></MemoryRouter>);
}

describe('Sidebar', () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    localStorage.clear();
    definirValoresOcultos(false);
  });

  it('começa recolhida, só com os ícones e o nome como dica', () => {
    renderizarSidebar();
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(nav).toHaveClass('sidebar--recolhida');
    expect(screen.getByRole('link', { name: 'Início' })).toHaveAttribute('title', 'Início');
    expect(screen.getByRole('link', { name: 'Clientes' })).toHaveAttribute('title', 'Clientes');
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
    expect(screen.getByRole('link', { name: 'Início' })).not.toHaveAttribute('title');
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

  it('cada serviço é um subitem de Serviços, na ordem dos setores', async () => {
    renderizarSidebar();
    const rotulos = screen.getAllByRole('link').map((l) => l.getAttribute('aria-label'));
    expect(rotulos).toEqual([
      'Início', 'Clientes', 'Orçamentos', 'Sites e Sistemas', 'Google Meu Negócio', 'Placas NFC',
      'Tarefas', 'Conteúdo', 'Portfólio', 'Financeiro', 'Cérebro', 'Configurações',
    ]);
    expect(screen.queryByRole('link', { name: 'Serviços' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Google Meu Negócio' })).toHaveAttribute('href', '/servicos?aba=gmn');
    expect(screen.getByRole('link', { name: 'Placas NFC' })).toHaveAttribute('href', '/servicos?aba=placas');
    expect(screen.getByRole('link', { name: 'Orçamentos' })).toHaveAttribute('href', '/orcamentos');
  });

  it('marca só o serviço da aba aberta (Sites e Sistemas é o padrão)', async () => {
    const { unmount } = render(<MemoryRouter initialEntries={['/servicos']}><Sidebar /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Sites e Sistemas' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Placas NFC' })).not.toHaveAttribute('aria-current');
    unmount();
    render(<MemoryRouter initialEntries={['/servicos?aba=placas']}><Sidebar /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Placas NFC' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Sites e Sistemas' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Clientes' })).not.toHaveAttribute('aria-current');
  });

  it('no computador os itens ficam em setores com título, todos visíveis', () => {
    renderizarSidebar();
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    const titulos = [...nav.querySelectorAll('.sidebar__setor-titulo')].map((t) => t.textContent);
    expect(titulos).toEqual(['Comercial', 'Produção', 'Marketing', 'Sistema']);
    expect(screen.getByRole('link', { name: 'Clientes' })).toBeVisible();
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

  it('no celular, "Mais" abre e fecha os itens secundários (barra de baixo)', async () => {
    vi.stubGlobal('matchMedia', (q) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} }));
    renderizarSidebar();
    const usuario = userEvent.setup();
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    const mais = screen.getByRole('button', { name: 'Mais' });
    expect(mais).toHaveAttribute('aria-expanded', 'false');
    await usuario.click(mais);
    expect(mais).toHaveAttribute('aria-expanded', 'true');
    expect(nav).toHaveClass('sidebar--mais-aberto');
    await usuario.keyboard('{Escape}');
    expect(nav).not.toHaveClass('sidebar--mais-aberto');
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
