import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SeletorCategorias } from './SeletorCategorias.jsx';

const categorias = [{ id: 1, nome: 'Site' }, { id: 3, nome: 'Sistema' }, { id: 4, nome: 'SaaS' }];

function Teste({ inicial = [] }) {
  const [ids, setIds] = useState(inicial);
  return <><SeletorCategorias categorias={categorias} selecionadas={ids} onChange={setIds} /><output>{ids.join(',')}</output></>;
}

describe('SeletorCategorias', () => {
  it('marca e desmarca pílulas mantendo a ordem do cadastro', async () => {
    render(<Teste inicial={[4]} />);
    const grupo = screen.getByRole('group', { name: 'Categorias' });
    expect(within(grupo).getByRole('button', { name: 'SaaS' })).toHaveAttribute('aria-pressed', 'true');
    const user = userEvent.setup();
    await user.click(within(grupo).getByRole('button', { name: 'Site' }));
    expect(screen.getByRole('status')).toHaveTextContent('1,4');
    await user.click(within(grupo).getByRole('button', { name: 'SaaS' }));
    expect(screen.getByRole('status')).toHaveTextContent('1');
  });

  it('mostra o erro', () => {
    render(<SeletorCategorias categorias={categorias} selecionadas={[]} onChange={() => {}} erro="Escolha pelo menos uma categoria" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Escolha pelo menos uma categoria');
  });
});
