import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Funil } from './Funil.jsx';

const etapas = [
  { etapa: 'ideia', quantidade: 24, percentual: 100 },
  { etapa: 'valor_definido', quantidade: 12, percentual: 50 },
  { etapa: 'andamento', quantidade: 7, percentual: 29 },
  { etapa: 'entregue', quantidade: 5, percentual: 21 },
];

describe('Funil', () => {
  it('mostra quantidade, nome e percentual de cada etapa', () => {
    render(<Funil etapas={etapas} perdidos={0} />);
    expect(screen.getByRole('img', { name: 'Funil de oportunidades' })).toBeInTheDocument();
    for (const texto of ['24', '12', '7', '5', 'Ideia', 'Valor definido', 'Versão final', 'Entregue', '100%', '50%', '29%', '21%']) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
    expect(screen.queryByText(/perdido/)).not.toBeInTheDocument();
  });

  it('mostra os perdidos no singular e no plural', () => {
    const { rerender } = render(<Funil etapas={etapas} perdidos={1} />);
    expect(screen.getByText('1 perdido')).toBeInTheDocument();
    rerender(<Funil etapas={etapas} perdidos={3} />);
    expect(screen.getByText('3 perdidos')).toBeInTheDocument();
  });

  it('com etapas zeradas ainda desenha as 4 faixas', () => {
    const zeradas = etapas.map((e, i) => ({ ...e, quantidade: i === 0 ? 2 : 0, percentual: i === 0 ? 100 : 0 }));
    const { container } = render(<Funil etapas={zeradas} perdidos={2} />);
    const faixas = container.querySelectorAll('path');
    expect(faixas).toHaveLength(4);
    for (const f of faixas) expect(f.getAttribute('d')).not.toMatch(/NaN/);
  });
});
