import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LinkInstagram } from './LinkInstagram.jsx';
import { arroba } from '../lib/instagram.js';

describe('arroba', () => {
  it('deixa um @ só na frente, e vazio quando não há perfil', () => {
    expect(arroba('perfil')).toBe('@perfil');
    expect(arroba(' @@perfil ')).toBe('@perfil');
    expect(arroba('@')).toBe('');
    expect(arroba(null)).toBe('');
  });
});

describe('LinkInstagram', () => {
  it('mostra o perfil com @ e abre o Instagram dele em outra aba', () => {
    render(<LinkInstagram instagram="madia.consultoria" />);
    const link = screen.getByRole('link', { name: '@madia.consultoria' });
    expect(link).toHaveAttribute('href', 'https://www.instagram.com/madia.consultoria/');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('sem perfil mostra um traço', () => {
    render(<LinkInstagram instagram="" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
