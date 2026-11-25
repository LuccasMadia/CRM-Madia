import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CommitsPorSemana } from './CommitsPorSemana.jsx';

const semanas = (totais) => totais.map((total, i) => ({ semana: `2026-01-${String(i + 1).padStart(2, '0')}`, total }));

describe('CommitsPorSemana', () => {
  it('desenha uma barra por semana e descreve o total no aria-label', () => {
    render(<CommitsPorSemana semanas={semanas([0, 3, 6])} calculando={false} />);
    const grafico = screen.getByRole('img', { name: 'Commits por semana nos últimos 12 meses: 9' });
    expect(grafico.querySelectorAll('rect')).toHaveLength(3);
  });

  it('a barra mais alta é a da semana com mais commits', () => {
    render(<CommitsPorSemana semanas={semanas([1, 4])} calculando={false} />);
    const [pequena, grande] = [...screen.getByRole('img').querySelectorAll('rect')].map((r) => Number(r.getAttribute('height')));
    expect(grande).toBeGreaterThan(pequena);
  });

  it('calculando mostra o aviso em vez do gráfico', () => {
    render(<CommitsPorSemana semanas={[]} calculando />);
    expect(screen.getByText('Calculando commits…')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('sem nenhum commit diz isso', () => {
    render(<CommitsPorSemana semanas={semanas([0, 0])} calculando={false} />);
    expect(screen.getByText('Nenhum commit nos últimos 12 meses.')).toBeInTheDocument();
  });
});
