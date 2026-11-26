import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConexaoGithub } from './ConexaoGithub.jsx';
import { mockApi, resposta } from '../../test/mockApi.js';

const DESCONECTADO = { conectado: false, usuario: null };
const CONECTADO = { conectado: true, usuario: 'lucas' };

describe('ConexaoGithub', () => {
  it('conecta com o token colado e mostra o usuário', async () => {
    const { chamadas } = mockApi({ 'GET /github': DESCONECTADO, 'PUT /github/conexao': CONECTADO });
    render(<ConexaoGithub />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Token do GitHub'), 'ghp_abc');
    await user.click(screen.getByRole('button', { name: 'Conectar' }));
    expect(await screen.findByText('Conectado como lucas')).toBeInTheDocument();
    expect(chamadas.find((c) => c.metodo === 'PUT').corpo).toEqual({ token: 'ghp_abc' });
    expect(screen.queryByLabelText('Token do GitHub')).toBeNull();
  });

  it('mostra o erro de token inválido no campo', async () => {
    mockApi({
      'GET /github': DESCONECTADO,
      'PUT /github/conexao': resposta(400, { erros: [{ campo: 'token', mensagem: 'Token inválido ou sem permissão' }] }),
    });
    render(<ConexaoGithub />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Token do GitHub'), 'ruim');
    await user.click(screen.getByRole('button', { name: 'Conectar' }));
    expect(await screen.findByText('Token inválido ou sem permissão')).toBeInTheDocument();
  });

  it('desconecta e volta ao formulário', async () => {
    const { chamadas } = mockApi({ 'GET /github': CONECTADO, 'DELETE /github/conexao': DESCONECTADO });
    render(<ConexaoGithub />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Desconectar' }));
    expect(await screen.findByLabelText('Token do GitHub')).toBeInTheDocument();
    expect(chamadas.some((c) => c.metodo === 'DELETE' && c.caminho === '/github/conexao')).toBe(true);
  });

  it('avisa que o token dá acesso aos repositórios privados e deve ser só do CRM', async () => {
    mockApi({ 'GET /github': DESCONECTADO });
    render(<ConexaoGithub />);
    expect(await screen.findByText(/acesso aos seus repositórios privados/)).toBeInTheDocument();
    expect(screen.getByText(/só para o CRM/)).toBeInTheDocument();
  });
});
