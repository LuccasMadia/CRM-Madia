import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConexaoInstagram } from './ConexaoInstagram.jsx';
import { mockApi, resposta } from '../../test/mockApi.js';

const DESCONECTADO = { conectado: false, usuario: null, expira_em: null };
const CONECTADO = { conectado: true, usuario: 'luccasmadia', expira_em: '2026-12-15T15:00:00.000Z' };

describe('ConexaoInstagram', () => {
  it('conecta com o token colado', async () => {
    const { chamadas } = mockApi({ 'GET /instagram/estado': DESCONECTADO, 'PUT /instagram/conexao': CONECTADO });
    render(<ConexaoInstagram />);
    const user = userEvent.setup();
    expect(screen.getByText('Como gerar o token')).toBeInTheDocument();
    await user.type(await screen.findByLabelText('Token de acesso'), 'abc');
    await user.click(screen.getByRole('button', { name: 'Conectar' }));
    expect(await screen.findByText(/Conectado como @luccasmadia/)).toBeInTheDocument();
    expect(screen.getByText(/15\/12\/2026/)).toBeInTheDocument();
    expect(chamadas.find((c) => c.metodo === 'PUT').corpo).toEqual({ token: 'abc' });
  });

  it('mostra o erro de token inválido no campo', async () => {
    mockApi({
      'GET /instagram/estado': DESCONECTADO,
      'PUT /instagram/conexao': resposta(400, { erros: [{ campo: 'token', mensagem: 'Token inválido ou sem permissão' }] }),
    });
    render(<ConexaoInstagram />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Token de acesso'), 'ruim');
    await user.click(screen.getByRole('button', { name: 'Conectar' }));
    expect(await screen.findByText('Token inválido ou sem permissão')).toBeInTheDocument();
  });

  it('desconecta', async () => {
    const { chamadas } = mockApi({ 'GET /instagram/estado': CONECTADO, 'DELETE /instagram/conexao': resposta(204) });
    render(<ConexaoInstagram />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Desconectar' }));
    expect(await screen.findByLabelText('Token de acesso')).toBeInTheDocument();
    expect(chamadas.some((c) => c.metodo === 'DELETE' && c.caminho === '/instagram/conexao')).toBe(true);
  });
});

describe('ConexaoInstagram — token expirado', () => {
  it('mostra o erro e deixa colar um token novo sem desconectar', async () => {
    const { chamadas } = mockApi({
      'GET /instagram/estado': { ...CONECTADO, ultimo_erro: 'O acesso ao Instagram expirou. Reconecte em Configurações.' },
      'PUT /instagram/conexao': CONECTADO,
    });
    render(<ConexaoInstagram />);
    const user = userEvent.setup();
    expect(await screen.findByText(/O acesso ao Instagram expirou/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Token de acesso'), 'novo');
    await user.click(screen.getByRole('button', { name: 'Conectar' }));
    expect(chamadas.find((c) => c.metodo === 'PUT').corpo).toEqual({ token: 'novo' });
    expect(chamadas.some((c) => c.metodo === 'DELETE')).toBe(false);
  });

  it('conectado sem erro oferece trocar o token', async () => {
    mockApi({ 'GET /instagram/estado': CONECTADO });
    render(<ConexaoInstagram />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Colar novo token' }));
    expect(screen.getByLabelText('Token de acesso')).toBeInTheDocument();
  });
});
