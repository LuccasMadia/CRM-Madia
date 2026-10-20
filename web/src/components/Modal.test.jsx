import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from './Modal.jsx';

function montar() {
  const onFechar = vi.fn();
  const { container } = render(
    <Modal titulo="Nova venda" onFechar={onFechar}><input aria-label="Nome" /></Modal>,
  );
  return { onFechar, fundo: container.querySelector('.modal__fundo') };
}

describe('Modal', () => {
  it('fecha ao clicar no fundo', () => {
    const { onFechar, fundo } = montar();
    fireEvent.mouseDown(fundo);
    fireEvent.mouseUp(fundo);
    fireEvent.click(fundo);
    expect(onFechar).toHaveBeenCalledTimes(1);
  });

  it('não fecha quando aperta dentro e solta no fundo (ex: selecionando texto)', () => {
    const { onFechar, fundo } = montar();
    fireEvent.mouseDown(screen.getByLabelText('Nome'));
    fireEvent.mouseUp(fundo);
    fireEvent.click(fundo);
    expect(onFechar).not.toHaveBeenCalled();
  });

  it('não fecha quando aperta no fundo e solta dentro', () => {
    const { onFechar, fundo } = montar();
    fireEvent.mouseDown(fundo);
    fireEvent.mouseUp(screen.getByLabelText('Nome'));
    fireEvent.click(fundo);
    expect(onFechar).not.toHaveBeenCalled();
  });
});
