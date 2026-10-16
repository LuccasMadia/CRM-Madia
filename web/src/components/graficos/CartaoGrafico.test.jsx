import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CartaoGrafico } from './CartaoGrafico.jsx';

describe('CartaoGrafico', () => {
  it('mostra título, subtítulo e o conteúdo', () => {
    render(<CartaoGrafico titulo="Recebido por mês" subtitulo="últimos 6 meses"><p>grafico</p></CartaoGrafico>);
    expect(screen.getByRole('heading', { name: 'Recebido por mês' })).toBeInTheDocument();
    expect(screen.getByText('últimos 6 meses')).toBeInTheDocument();
    expect(screen.getByText('grafico')).toBeInTheDocument();
  });

  it('vazio troca o conteúdo por "Ainda sem dados"', () => {
    render(<CartaoGrafico titulo="Funil" vazio><p>grafico</p></CartaoGrafico>);
    expect(screen.getByText('Ainda sem dados')).toBeInTheDocument();
    expect(screen.queryByText('grafico')).not.toBeInTheDocument();
  });
});
