import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Confirmacao } from './Confirmacao.jsx';

function montar(props = {}) {
  const onConfirmar = props.onConfirmar ?? vi.fn().mockResolvedValue(undefined);
  const onFechar = vi.fn();
  render(
    <Confirmacao titulo="Tirar Site do ar?" mensagem="Vai tirar rango.com.br" rotuloConfirmar="Tirar do ar" onConfirmar={onConfirmar} onFechar={onFechar} />,
  );
  return { onConfirmar, onFechar };
}

describe('Confirmacao', () => {
  it('confirma e fecha em caso de sucesso', async () => {
    const { onConfirmar, onFechar } = montar();
    expect(screen.getByRole('dialog', { name: 'Tirar Site do ar?' })).toBeInTheDocument();
    expect(screen.getByText('Vai tirar rango.com.br')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tirar do ar' }));
    expect(onConfirmar).toHaveBeenCalledTimes(1);
    expect(onFechar).toHaveBeenCalledTimes(1);
  });

  it('mostra o erro dentro do diálogo e continua aberto', async () => {
    const { onFechar } = montar({ onConfirmar: vi.fn().mockRejectedValue(new Error('Token da Vercel inválido')) });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tirar do ar' }));
    expect(await screen.findByText('Token da Vercel inválido')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onFechar).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Tirar do ar' })).toBeEnabled();
  });

  it('desabilita os botões enquanto confirma', async () => {
    let liberar;
    montar({ onConfirmar: () => new Promise((r) => { liberar = r; }) });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tirar do ar' }));
    expect(screen.getByRole('button', { name: 'Tirar do ar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    liberar();
  });

  it('Cancelar chama onFechar', async () => {
    const { onConfirmar, onFechar } = montar();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onFechar).toHaveBeenCalledTimes(1);
    expect(onConfirmar).not.toHaveBeenCalled();
  });
});
