import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
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
    expect(await screen.findByRole('heading', { name: 'Ana' })).toBeInTheDocument();
    expect(screen.getByText(/Padaria da Ana · 11 99999-0000/)).toBeInTheDocument();
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
    const { chamadas } = mockApi(rotasPerfil({ 'PUT /clientes/1': { ...clienteExemplo, nome: 'Ana Souza' } }));
    abrir();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Editar dados' }));
    const nome = screen.getByLabelText('Nome');
    await user.clear(nome);
    await user.type(nome, 'Ana Souza');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(chamadas.find((c) => c.metodo === 'PUT').corpo.nome).toBe('Ana Souza');
  });

  it('mostra a mensagem quando o servidor recusa a exclusão', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockApi(rotasPerfil({ 'DELETE /clientes/1': resposta(409, { erro: 'Este cliente tem projetos.' }) }));
    abrir();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Excluir' }));
    expect(await screen.findByText('Este cliente tem projetos.')).toBeInTheDocument();
  });
});
