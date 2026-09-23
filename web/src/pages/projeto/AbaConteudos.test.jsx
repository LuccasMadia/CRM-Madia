import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AbaConteudos } from './AbaConteudos.jsx';
import { mockApi } from '../../test/mockApi.js';

describe('AbaConteudos', () => {
  it('cria conteúdo já ligado ao projeto', async () => {
    const { chamadas } = mockApi({ 'GET /conteudos?projeto_id=5': [], 'POST /conteudos': { id: 1 } });
    render(<AbaConteudos projetoId={5} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '+ Conteúdo' }));
    expect(screen.queryByLabelText('Projeto (opcional)')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Título / ideia'), 'Case no Insta');
    await user.click(screen.getByRole('button', { name: 'Salvar conteúdo' }));
    await screen.findByRole('button', { name: '+ Conteúdo' });
    expect(chamadas.find((c) => c.metodo === 'POST').corpo).toMatchObject({ titulo: 'Case no Insta', projeto_id: 5 });
  });
});
