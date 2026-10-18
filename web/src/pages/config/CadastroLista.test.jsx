import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CadastroLista } from './CadastroLista.jsx';
import { mockApi, resposta } from '../../test/mockApi.js';

const categorias = [{ id: 1, nome: 'Site', ordem: 1 }, { id: 2, nome: 'SaaS', ordem: 2 }];

describe('CadastroLista', () => {
  it('lista, adiciona e mostra o erro de nome repetido sem perder o texto', async () => {
    const { chamadas, rotas } = mockApi({ 'GET /categorias': categorias, 'POST /categorias': resposta(400, { erros: [{ campo: 'nome', mensagem: 'Já existe' }] }) });
    render(<CadastroLista titulo="Categorias" caminho="/categorias" rotuloNovo="Nova categoria" ordenavel />);
    expect(await screen.findByText('Site')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Nova categoria'), 'site');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    expect(await screen.findByText('Já existe')).toBeInTheDocument();
    expect(screen.getByLabelText('Nova categoria')).toHaveValue('site');
    rotas['POST /categorias'] = { id: 3, nome: 'Landing', ordem: 3 };
    rotas['GET /categorias'] = [...categorias, { id: 3, nome: 'Landing', ordem: 3 }];
    await user.clear(screen.getByLabelText('Nova categoria'));
    await user.type(screen.getByLabelText('Nova categoria'), 'Landing');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    expect(await screen.findByText('Landing')).toBeInTheDocument();
    expect(screen.getByLabelText('Nova categoria')).toHaveValue('');
    expect(chamadas.filter((c) => c.metodo === 'POST').at(-1).corpo).toEqual({ nome: 'Landing' });
  });

  it('renomeia', async () => {
    const { chamadas } = mockApi({ 'GET /categorias': categorias, 'PUT /categorias/2': { id: 2, nome: 'SaaS B2B', ordem: 2 } });
    render(<CadastroLista titulo="Categorias" caminho="/categorias" rotuloNovo="Nova categoria" ordenavel />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Renomear SaaS' }));
    const campo = screen.getByLabelText('Novo nome de SaaS');
    await user.clear(campo);
    await user.type(campo, 'SaaS B2B');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(chamadas.find((c) => c.metodo === 'PUT')?.corpo).toEqual({ nome: 'SaaS B2B' }));
  });

  it('exclui com confirmação e mostra o 409 quando está em uso', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockApi({ 'GET /categorias': categorias, 'DELETE /categorias/1': resposta(409, { erro: 'Em uso por 3 projeto(s)' }) });
    render(<CadastroLista titulo="Categorias" caminho="/categorias" rotuloNovo="Nova categoria" ordenavel />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Excluir Site' }));
    expect(await screen.findByText('Em uso por 3 projeto(s)')).toBeInTheDocument();
    expect(screen.getByText('Site')).toBeInTheDocument();
  });

  it('setas trocam a ordem de dois itens vizinhos', async () => {
    const { chamadas } = mockApi({ 'GET /categorias': categorias, 'PUT /categorias/1': {}, 'PUT /categorias/2': {} });
    render(<CadastroLista titulo="Categorias" caminho="/categorias" rotuloNovo="Nova categoria" ordenavel />);
    const linhaSaas = (await screen.findByText('SaaS')).closest('li');
    await userEvent.setup().click(within(linhaSaas).getByRole('button', { name: 'Subir SaaS' }));
    await waitFor(() => expect(chamadas.filter((c) => c.metodo === 'PUT')).toHaveLength(2));
    expect(chamadas.filter((c) => c.metodo === 'PUT').map((c) => [c.caminho, c.corpo])).toEqual([
      ['/categorias/2', { ordem: 1 }], ['/categorias/1', { ordem: 2 }],
    ]);
    expect(screen.queryByRole('button', { name: 'Subir Site' })).toBeNull();
  });
});
