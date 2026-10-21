import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { Notificacoes } from './Notificacoes.jsx';
import { notificar } from '../lib/notificacoes.js';

afterEach(() => vi.useRealTimers());

describe('Notificacoes', () => {
  it('mostra o aviso e some sozinho depois de alguns segundos', () => {
    vi.useFakeTimers();
    render(<Notificacoes />);
    act(() => { notificar('Cliente salvo'); });
    expect(screen.getByText('Cliente salvo')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(4000); });
    expect(screen.queryByText('Cliente salvo')).not.toBeInTheDocument();
  });

  it('pode ser dispensado no ×', () => {
    render(<Notificacoes />);
    act(() => { notificar('Parcela excluída'); });
    act(() => { screen.getByRole('button', { name: 'Dispensar aviso' }).click(); });
    expect(screen.queryByText('Parcela excluída')).not.toBeInTheDocument();
  });
});
