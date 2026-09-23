import { describe, it, expect } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Clientes } from './Clientes.jsx';
import { mockApi, resposta } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';

const ana = { id: 1, nome: 'Ana Souza', empresa: 'Doces da Ana', email: null, telefone: null };

describe('Clientes', () => {
  it('lista e busca', async () => {
    const { chamadas } = mockApi({ 'GET /clientes?busca=': [ana], 'GET /clientes?busca=doces': [ana] });
    renderizar(<Clientes />, { rota: '/clientes', padrao: '/clientes' });
    expect(await screen.findByRole('link', { name: 'Ana Souza' })).toHaveAttribute('href', '/clientes/1');
    fireEvent.change(screen.getByLabelText('Buscar clientes'), { target: { value: 'doces' } });
    await screen.findByRole('link', { name: 'Ana Souza' });
    expect(chamadas.at(-1).caminho).toBe('/clientes?busca=doces');
  });

  it('mostra erro do servidor ao lado do campo ao criar', async () => {
    mockApi({
      'GET /clientes?busca=': [],
      'POST /clientes': resposta(400, { erros: [{ campo: 'nome', mensagem: 'Obrigatório' }] }),
    });
    renderizar(<Clientes />, { rota: '/clientes', padrao: '/clientes' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '+ Cliente' }));
    await user.click(screen.getByRole('button', { name: 'Criar cliente' }));
    expect(await screen.findByText('Obrigatório')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome')).toHaveAttribute('aria-invalid', 'true');
  });

  it('cria e navega para o detalhe', async () => {
    const { chamadas } = mockApi({ 'GET /clientes?busca=': [], 'POST /clientes': { ...ana, id: 7 } });
    renderizar(<Clientes />, { rota: '/clientes', padrao: '/clientes' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '+ Cliente' }));
    await user.type(screen.getByLabelText('Nome'), 'Ana Souza');
    await user.click(screen.getByRole('button', { name: 'Criar cliente' }));
    expect(await screen.findByText('Outra página')).toBeInTheDocument();
    expect(chamadas.find((c) => c.metodo === 'POST').corpo).toMatchObject({ nome: 'Ana Souza', empresa: '' });
  });
});
