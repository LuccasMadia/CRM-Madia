import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Numero } from './Numero.jsx';

describe('Numero', () => {
  it('mostra rótulo e valor', () => {
    render(<Numero rotulo="Recebido">R$ 10,00</Numero>);
    expect(screen.getByText('Recebido')).toBeInTheDocument();
    expect(screen.getByText('R$ 10,00')).toBeInTheDocument();
  });

  it('sem ícone não desenha o quadrado do ícone', () => {
    const { container } = render(<Numero rotulo="Recebido">R$ 10,00</Numero>);
    expect(container.querySelector('.cartao-numero__icone')).toBeNull();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('com ícone desenha o ícone ao lado do valor', () => {
    const { container } = render(<Numero rotulo="Atrasadas" icone="alerta">2</Numero>);
    const caixa = container.querySelector('.cartao-numero__icone');
    expect(caixa).not.toBeNull();
    expect(caixa.querySelector('svg path')).not.toBeNull();
    expect(container.querySelector('.cartao-numero')).not.toBeNull();
  });
});
