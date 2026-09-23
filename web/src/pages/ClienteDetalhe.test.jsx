import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClienteDetalhe } from './ClienteDetalhe.jsx';
import { mockApi, resposta } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';

const cliente = {
  id: 1, nome: 'Ana', empresa: null, email: null, telefone: null, instagram: null, origem: null, notas: null,
  atualizado_em: 'T', total_faturado_centavos: 150050,
  projetos: [{ id: 4, titulo: 'Site', etapa: 'andamento' }],
};

describe('ClienteDetalhe', () => {
  it('mostra projetos e total faturado', async () => {
    mockApi({ 'GET /clientes/1': cliente });
    renderizar(<ClienteDetalhe />, { rota: '/clientes/1', padrao: '/clientes/:id' });
    expect(await screen.findByRole('link', { name: 'Site' })).toHaveAttribute('href', '/projetos/4');
    expect(screen.getByText(/1\.500,50/)).toBeInTheDocument();
    expect(screen.getByText('Em andamento')).toBeInTheDocument();
  });

  it('mostra a mensagem quando o servidor recusa a exclusão', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockApi({
      'GET /clientes/1': cliente,
      'DELETE /clientes/1': resposta(409, { erro: 'Este cliente tem projetos.' }),
    });
    renderizar(<ClienteDetalhe />, { rota: '/clientes/1', padrao: '/clientes/:id' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Excluir' }));
    expect(await screen.findByText('Este cliente tem projetos.')).toBeInTheDocument();
  });
});
