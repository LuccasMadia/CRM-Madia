import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConexaoGmail } from './ConexaoGmail.jsx';
import { mockApi, resposta } from '../../test/mockApi.js';

const SEM_NADA = { configurado: false, conectado: false, usuario: null };
const SALVO = { configurado: true, conectado: false, usuario: null };
const CONECTADO = { configurado: true, conectado: true, usuario: 'eu@gmail.com' };

describe('ConexaoGmail', () => {
  it('salva o Client ID e o Client Secret e então mostra o botão de conectar', async () => {
    const { chamadas } = mockApi({ 'GET /gmail': SEM_NADA, 'PUT /gmail/credenciais': SALVO });
    render(<ConexaoGmail />);
    const user = userEvent.setup();
    expect(await screen.findByLabelText('Client ID')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Conectar com o Google' })).toBeNull();
    await user.type(screen.getByLabelText('Client ID'), 'meu-id');
    await user.type(screen.getByLabelText('Client Secret'), 'meu-segredo');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    const conectar = await screen.findByRole('link', { name: 'Conectar com o Google' });
    expect(conectar).toHaveAttribute('href', '/api/gmail/autorizar');
    expect(chamadas.find((c) => c.metodo === 'PUT').corpo).toEqual({ client_id: 'meu-id', client_secret: 'meu-segredo' });
    expect(screen.getByLabelText('Client ID')).toHaveValue('');
  });

  it('o Client Secret fica escondido na digitação', async () => {
    mockApi({ 'GET /gmail': SEM_NADA });
    render(<ConexaoGmail />);
    expect(await screen.findByLabelText('Client Secret')).toHaveAttribute('type', 'password');
  });

  it('mostra o erro do servidor quando as credenciais são recusadas', async () => {
    mockApi({ 'GET /gmail': SEM_NADA, 'PUT /gmail/credenciais': resposta(400, { erros: [{ campo: 'client_id', mensagem: 'Informe o Client ID' }] }) });
    render(<ConexaoGmail />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Client ID'), 'x');
    await user.type(screen.getByLabelText('Client Secret'), 'y');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Informe o Client ID')).toBeInTheDocument();
  });

  it('conectado mostra a conta e desconecta', async () => {
    const { chamadas } = mockApi({ 'GET /gmail': CONECTADO, 'DELETE /gmail/conexao': SEM_NADA });
    render(<ConexaoGmail />);
    expect(await screen.findByText('Conectado como eu@gmail.com')).toBeInTheDocument();
    expect(screen.queryByLabelText('Client ID')).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Desconectar' }));
    expect(await screen.findByLabelText('Client ID')).toBeInTheDocument();
    expect(chamadas.some((c) => c.metodo === 'DELETE')).toBe(true);
  });

  it('o passo a passo avisa do modo Teste e manda publicar como Em produção', async () => {
    mockApi({ 'GET /gmail': SEM_NADA });
    render(<ConexaoGmail />);
    await screen.findByLabelText('Client ID');
    await userEvent.setup().click(screen.getByText('Como conectar'));
    expect(screen.getByText(/Em produção/)).toBeInTheDocument();
    expect(screen.getByText(/7 dias/)).toBeInTheDocument();
    expect(screen.getByText('http://127.0.0.1:5174/api/gmail/callback')).toBeInTheDocument();
  });
});
