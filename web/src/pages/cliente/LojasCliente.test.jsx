import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClienteDetalhe } from '../ClienteDetalhe.jsx';
import { mockApi } from '../../test/mockApi.js';
import { renderizar } from '../../test/renderizar.jsx';
import { rotasPerfil, clienteExemplo, gmn } from '../../test/perfilCliente.js';

const vila = { id: 3, cliente_id: 1, nome: 'Vila Alegre', responsavel: 'Martins' };
const centro = { id: 4, cliente_id: 1, nome: 'Centro', responsavel: null };
const comLojas = { ...clienteExemplo, lojas: [centro, vila] };
const abrir = (aba = '') => renderizar(<ClienteDetalhe />, { rota: `/clientes/1${aba}`, padrao: '/clientes/:id' });

describe('Lojas do cliente', () => {
  it('sem lojas não mostra a seção; Adicionar loja cadastra com responsável opcional', async () => {
    const { chamadas } = mockApi(rotasPerfil({ 'POST /clientes/1/lojas': [centro] }));
    abrir();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Adicionar loja' }));
    expect(screen.queryByRole('region', { name: 'Lojas' })).toBeNull();
    const dialogo = screen.getByRole('dialog', { name: 'Adicionar loja' });
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }));
    expect(within(dialogo).getByText('Informe o nome da loja')).toBeInTheDocument();
    await user.type(within(dialogo).getByLabelText('Nome da loja'), 'Centro');
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }));
    await vi.waitFor(() => expect(chamadas.find((c) => c.metodo === 'POST')?.corpo).toEqual({ nome: 'Centro', responsavel: '' }));
  });

  it('lista as lojas e remove depois de confirmar', async () => {
    const { chamadas } = mockApi(rotasPerfil({ 'GET /clientes/1': comLojas, 'DELETE /clientes/1/lojas/3': [centro] }));
    abrir();
    const secao = await screen.findByRole('region', { name: 'Lojas' });
    expect(within(secao).getByText('Vila Alegre')).toBeInTheDocument();
    expect(within(secao).getByText(/Martins/)).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(within(secao).getByRole('button', { name: 'Remover Vila Alegre' }));
    await user.click(within(screen.getByRole('dialog', { name: /Remover a loja Vila Alegre/ })).getByRole('button', { name: 'Remover' }));
    await vi.waitFor(() => expect(chamadas.some((c) => c.metodo === 'DELETE' && c.caminho === '/clientes/1/lojas/3')).toBe(true));
  });

  it('o perfil do Google escolhe a loja e o cartão mostra o nome dela', async () => {
    const { chamadas } = mockApi(rotasPerfil({
      'GET /clientes/1': comLojas,
      'GET /projetos?cliente_id=1': [{ ...gmn, loja_id: 3, loja_nome: 'Vila Alegre' }],
      'POST /projetos': { ...gmn, id: 9 },
    }));
    abrir('?aba=gmn');
    expect(await screen.findByText('Vila Alegre', { selector: 'li.cartao strong' })).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '+ Google Meu Negócio' }));
    const dialogo = screen.getByRole('dialog');
    await user.selectOptions(await within(dialogo).findByLabelText('Loja'), 'Centro');
    await user.type(within(dialogo).getByLabelText('Valor (R$)'), '200');
    await user.type(within(dialogo).getByLabelText('Vencimento'), '2026-10-05');
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }));
    await vi.waitFor(() => expect(chamadas.find((c) => c.metodo === 'POST')?.corpo).toMatchObject({ cliente_id: 1, loja_id: 4 }));
  });
});
