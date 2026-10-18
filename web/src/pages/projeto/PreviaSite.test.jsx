import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PreviaSite, normalizarLink } from './PreviaSite.jsx';
import { mockApi } from '../../test/mockApi.js';

const projeto = { id: 5, titulo: 'Site Ana' };

describe('normalizarLink', () => {
  it('acrescenta https:// quando falta e ignora vazio', () => {
    expect(normalizarLink('pingou.com.br')).toBe('https://pingou.com.br');
    expect(normalizarLink(' http://a.com ')).toBe('http://a.com');
    expect(normalizarLink('')).toBeNull();
    expect(normalizarLink(null)).toBeNull();
  });
});

describe('PreviaSite', () => {
  it('com link mostra o iframe e os botões', async () => {
    mockApi({ 'GET /projetos/5/portfolio': { live_url: 'pingou.com.br', code_url: 'https://github.com/x/pingou', imagens: [] } });
    render(<PreviaSite projeto={projeto} />);
    const quadro = await screen.findByTitle('Pré-visualização de Site Ana');
    expect(quadro).toHaveAttribute('src', 'https://pingou.com.br');
    expect(quadro).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
    expect(screen.getByRole('link', { name: 'Abrir site ↗' })).toHaveAttribute('href', 'https://pingou.com.br');
    expect(screen.getByRole('link', { name: 'GitHub ↗' })).toHaveAttribute('href', 'https://github.com/x/pingou');
  });

  it('sem link mostra a capa do portfólio', async () => {
    mockApi({ 'GET /projetos/5/portfolio': { live_url: null, code_url: null, imagens: [{ id: 1, url: '/uploads/capa.png' }] } });
    render(<PreviaSite projeto={projeto} />);
    expect(await screen.findByRole('img', { name: 'Capa de Site Ana' })).toHaveAttribute('src', '/uploads/capa.png');
    expect(screen.queryByRole('link', { name: 'Abrir site ↗' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'GitHub ↗' })).toBeNull();
  });

  it('sem link nem capa mostra o aviso', async () => {
    mockApi({ 'GET /projetos/5/portfolio': { live_url: '', code_url: '', imagens: [] } });
    render(<PreviaSite projeto={projeto} />);
    expect(await screen.findByText('Sem link do site. Adicione em Divulgação → Portfólio.')).toBeInTheDocument();
  });

  it('se o portfólio falhar, mostra o aviso em vez de quebrar', async () => {
    mockApi({});
    render(<PreviaSite projeto={projeto} />);
    expect(await screen.findByText('Sem link do site. Adicione em Divulgação → Portfólio.')).toBeInTheDocument();
  });
});
