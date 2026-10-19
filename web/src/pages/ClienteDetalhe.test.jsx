import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClienteDetalhe } from './ClienteDetalhe.jsx';
import { mockApi, resposta } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';
import { rotasPerfil, clienteExemplo } from '../test/perfilCliente.js';

const abrir = (rota = '/clientes/1') => renderizar(<ClienteDetalhe />, { rota, padrao: '/clientes/:id' });

describe('ClienteDetalhe', () => {
  it('mostra o topo com contato e total faturado e abre na aba Sites e Sistemas', async () => {
    mockApi(rotasPerfil());
    abrir();
    expect(await screen.findByRole('heading', { name: 'Padaria da Ana' })).toBeInTheDocument();
    expect(screen.getByText(/Ana · 11 99999-0000/)).toBeInTheDocument();
    expect(screen.getByText(/1\.500,50/)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Sites e Sistemas (1)' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Google Meu Negócio (1)' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Placas NFC (0)' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Site' })).toHaveAttribute('href', '/projetos/4');
    expect(screen.getByText('Versão final')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Google Meu Negócio' })).not.toBeInTheDocument();
  });

  it('abre a aba indicada em ?aba= e troca de aba', async () => {
    mockApi(rotasPerfil());
    abrir('/clientes/1?aba=gmn');
    expect(await screen.findByRole('tab', { name: 'Google Meu Negócio (1)' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Sites e Sistemas (1)' }));
    expect(screen.getByRole('link', { name: 'Site' })).toBeInTheDocument();
  });

  it('+ Nova oportunidade abre o formulário com o cliente preenchido', async () => {
    mockApi(rotasPerfil({ 'GET /clientes': [{ id: 1, nome: 'Ana' }], 'GET /config': {} }));
    abrir();
    await userEvent.setup().click(await screen.findByRole('button', { name: '+ Nova oportunidade' }));
    expect(await screen.findByRole('option', { name: 'Ana' })).toBeInTheDocument();
    expect(screen.getByLabelText('Cliente')).toHaveValue('1');
  });

  it('Editar dados salva e recarrega', async () => {
    const { chamadas } = mockApi(rotasPerfil({ 'PUT /clientes/1': { ...clienteExemplo, responsavel: 'Ana Souza' } }));
    abrir();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Editar dados' }));
    expect(screen.getByLabelText('Empresa')).toHaveValue('Padaria da Ana');
    const responsavel = screen.getByLabelText('Responsável');
    await user.clear(responsavel);
    await user.type(responsavel, 'Ana Souza');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(chamadas.find((c) => c.metodo === 'PUT').corpo).toMatchObject({ nome: 'Padaria da Ana', responsavel: 'Ana Souza' });
  });

  it('mostra a mensagem quando o servidor recusa a exclusão', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockApi(rotasPerfil({ 'DELETE /clientes/1': resposta(409, { erro: 'Este cliente tem projetos.' }) }));
    abrir();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Excluir' }));
    expect(await screen.findByText('Este cliente tem projetos.')).toBeInTheDocument();
  });

  it('o topo só mostra a foto (ou as iniciais), sem controles de foto', async () => {
    mockApi(rotasPerfil({ 'GET /clientes/1': { ...clienteExemplo, foto: 'abc.jpg' } }));
    abrir();
    expect(await screen.findByRole('img', { name: 'Foto de Padaria da Ana' })).toHaveAttribute('src', '/uploads/abc.jpg');
    expect(screen.queryByLabelText(/foto/i)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remover foto' })).toBeNull();
  });

  it('Editar dados envia uma foto nova depois de salvar os dados', async () => {
    const { chamadas } = mockApi(rotasPerfil({
      'PUT /clientes/1': clienteExemplo,
      'POST /clientes/1/foto': { ...clienteExemplo, foto: 'nova.jpg' },
    }));
    abrir();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Editar dados' }));
    const dialogo = screen.getByRole('dialog', { name: 'Editar dados' });
    expect(within(dialogo).getByText('PA')).toBeInTheDocument();
    await user.upload(within(dialogo).getByLabelText('Foto'), new File(['img'], 'logo.png', { type: 'image/png' }));
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(chamadas.find((c) => c.metodo === 'POST')?.caminho).toBe('/clientes/1/foto'));
    const metodos = chamadas.filter((c) => c.metodo !== 'GET').map((c) => c.metodo);
    expect(metodos).toEqual(['PUT', 'POST']);
    expect(chamadas.find((c) => c.metodo === 'POST').corpo.get('foto').name).toBe('logo.png');
  });

  it('Editar dados remove a foto', async () => {
    const { chamadas } = mockApi(rotasPerfil({
      'GET /clientes/1': { ...clienteExemplo, foto: 'abc.jpg' },
      'PUT /clientes/1': clienteExemplo,
      'DELETE /clientes/1/foto': { ...clienteExemplo, foto: null },
    }));
    abrir();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Editar dados' }));
    const dialogo = screen.getByRole('dialog', { name: 'Editar dados' });
    await user.click(within(dialogo).getByRole('button', { name: 'Remover foto' }));
    expect(within(dialogo).queryByRole('img')).toBeNull();
    expect(chamadas.some((c) => c.metodo === 'DELETE')).toBe(false);
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(chamadas.some((c) => c.metodo === 'DELETE' && c.caminho === '/clientes/1/foto')).toBe(true));
  });
});
