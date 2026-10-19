import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GridInstagram } from './GridInstagram.jsx';

const item = (extra) => ({ id: 1, titulo: 'Foto', tipo: 'post', capa_url: null, ...extra });
const grid = (prontos) => render(<GridInstagram prontos={prontos} midias={[]} onEditar={vi.fn()} onMover={vi.fn()} />);

describe('GridInstagram', () => {
  it('agendado mostra data e hora curtas', () => {
    grid([item({ estado: 'agendado', agendado_para: new Date(2026, 9, 20, 18, 30).toISOString() })]);
    expect(screen.getByText(/Agendado · 20\/10\/2026.*18:30/)).toBeInTheDocument();
  });

  it('publicando mostra Publicando…', () => {
    grid([item({ estado: 'publicando' })]);
    expect(screen.getByText('Publicando…')).toBeInTheDocument();
  });

  it('só os prontos têm setas, com o índice contado entre os prontos', async () => {
    const onMover = vi.fn();
    render(
      <GridInstagram
        prontos={[
          item({ id: 1, titulo: 'Agendado', estado: 'agendado', agendado_para: new Date(2026, 9, 20).toISOString() }),
          item({ id: 2, titulo: 'A', estado: 'pronto' }),
          item({ id: 3, titulo: 'B', estado: 'pronto' }),
        ]}
        midias={[]}
        onEditar={vi.fn()}
        onMover={onMover}
      />,
    );
    expect(screen.queryByRole('button', { name: /Mover Agendado/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mover A para antes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mover B para depois' })).not.toBeInTheDocument();
    screen.getByRole('button', { name: 'Mover B para antes' }).click();
    expect(onMover).toHaveBeenCalledWith(1, -1);
  });

  it('pronto continua mostrando tipo', () => {
    grid([item({ estado: 'pronto' })]);
    expect(screen.getByText('Post')).toBeInTheDocument();
  });
});
