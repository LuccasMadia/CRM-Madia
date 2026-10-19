import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { Portfolio, URL_PORTFOLIO } from './Portfolio.jsx';
import { renderizar } from '../test/renderizar.jsx';

describe('Portfolio', () => {
  it('mostra o site dentro do CRM e oferece abrir em nova guia', () => {
    renderizar(<Portfolio />);
    expect(screen.getByTitle('Site do portfólio')).toHaveAttribute('src', URL_PORTFOLIO);
    const link = screen.getByRole('link', { name: 'Abrir em nova guia' });
    expect(link).toHaveAttribute('href', URL_PORTFOLIO);
    expect(link).toHaveAttribute('target', '_blank');
  });
});
