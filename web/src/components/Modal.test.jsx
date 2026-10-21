import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('foca o primeiro campo ao abrir e devolve o foco a quem abriu ao fechar', () => {
    const botao = document.createElement('button');
    document.body.appendChild(botao);
    botao.focus();
    const { unmount } = render(<Modal titulo="Nova venda" onFechar={() => {}}><input aria-label="Nome" /></Modal>);
    expect(screen.getByLabelText('Nome')).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(botao).toHaveFocus();
    expect(document.body.style.overflow).toBe('');
    botao.remove();
  });

  it('Esc fecha direto quando nada foi digitado', async () => {
    const { onFechar } = montar();
    await userEvent.setup().keyboard('{Escape}');
    expect(onFechar).toHaveBeenCalledTimes(1);
  });

  it('com algo digitado, pergunta antes de descartar', async () => {
    const user = userEvent.setup();
    const { onFechar } = montar();
    await user.type(screen.getByLabelText('Nome'), 'Rango');
    await user.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onFechar).not.toHaveBeenCalled();
    expect(screen.getByText('Descartar o que foi preenchido?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Continuar editando' }));
    expect(screen.queryByText('Descartar o que foi preenchido?')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nome')).toHaveValue('Rango');

    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(onFechar).toHaveBeenCalledTimes(1);
  });

  it('o Tab dá a volta dentro do modal', async () => {
    const user = userEvent.setup();
    montar();
    expect(screen.getByLabelText('Nome')).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Fechar' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByLabelText('Nome')).toHaveFocus();
  });
});
