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

  it('pronto continua mostrando tipo', () => {
    grid([item({ estado: 'pronto' })]);
    expect(screen.getByText('Post')).toBeInTheDocument();
  });
});
