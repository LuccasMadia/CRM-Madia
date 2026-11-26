import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConexaoFigma } from './ConexaoFigma.jsx';
import { mockApi, resposta } from '../../test/mockApi.js';

const DESCONECTADO = { conectado: false, usuario: null };
const CONECTADO = { conectado: true, usuario: 'lucas' };

describe('ConexaoFigma', () => {
  it('conecta com o token colado e mostra o usuário', async () => {
    const { chamadas } = mockApi({ 'GET /figma': DESCONECTADO, 'PUT /figma/conexao': CONECTADO });
    render(<ConexaoFigma />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Token do Figma'), 'figd_abc');
    await user.click(screen.getByRole('button', { name: 'Conectar' }));
    expect(await screen.findByText('Conectado como lucas')).toBeInTheDocument();
    expect(chamadas.find((c) => c.metodo === 'PUT').corpo).toEqual({ token: 'figd_abc' });
    expect(screen.queryByLabelText('Token do Figma')).toBeNull();
  });

  it('mostra o erro de token inválido no campo', async () => {
    mockApi({
      'GET /figma': DESCONECTADO,
      'PUT /figma/conexao': resposta(400, { erros: [{ campo: 'token', mensagem: 'Token inválido ou sem permissão' }] }),
    });
    render(<ConexaoFigma />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Token do Figma'), 'ruim');
    await user.click(screen.getByRole('button', { name: 'Conectar' }));
    expect(await screen.findByText('Token inválido ou sem permissão')).toBeInTheDocument();
  });

  it('desconecta e volta ao formulário', async () => {
    const { chamadas } = mockApi({ 'GET /figma': CONECTADO, 'DELETE /figma/conexao': DESCONECTADO });
    render(<ConexaoFigma />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Desconectar' }));
    expect(await screen.findByLabelText('Token do Figma')).toBeInTheDocument();
    expect(chamadas.some((c) => c.metodo === 'DELETE' && c.caminho === '/figma/conexao')).toBe(true);
  });
});
