import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GraficoRosca } from './GraficoRosca.jsx';

vi.mock('recharts', async () => (await import('../../test/mockRecharts.js')).rechartsFalso);

describe('GraficoRosca', () => {
  it('mostra o total no centro e a legenda com percentuais', () => {
    render(<GraficoRosca total={8} fatias={[
      { nome: 'Instagram', quantidade: 5 },
      { nome: 'Indicação', quantidade: 2 },
      { nome: 'Não informado', quantidade: 1 },
    ]} />);
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('clientes')).toBeInTheDocument();
    expect(screen.getByText('Instagram')).toBeInTheDocument();
    expect(screen.getByText('63%')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByText('13%')).toBeInTheDocument();
  });

  it('um cliente só usa o singular', () => {
    render(<GraficoRosca total={1} fatias={[{ nome: 'Google', quantidade: 1 }]} />);
    expect(screen.getByText('cliente')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });
});
