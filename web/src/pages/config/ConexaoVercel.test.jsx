import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConexaoVercel } from './ConexaoVercel.jsx';
import { mockApi, resposta } from '../../test/mockApi.js';

const DESCONECTADO = { conectado: false, prazo_dias: 7 };
const CONECTADO = { conectado: true, prazo_dias: 7 };

describe('ConexaoVercel', () => {
  it('conecta com o token colado', async () => {
    const { chamadas } = mockApi({ 'GET /vercel/estado': DESCONECTADO, 'PUT /vercel/conexao': CONECTADO });
    render(<ConexaoVercel />);
    const user = userEvent.setup();
    expect(screen.getByText('Como gerar o token')).toBeInTheDocument();
    await user.type(await screen.findByLabelText('Token da Vercel'), 'abc');
    await user.click(screen.getByRole('button', { name: 'Conectar' }));
    expect(await screen.findByText('Conectado')).toBeInTheDocument();
    expect(chamadas.find((c) => c.metodo === 'PUT').corpo).toEqual({ token: 'abc' });
  });

  it('mostra o erro de token inválido no campo', async () => {
    mockApi({
      'GET /vercel/estado': DESCONECTADO,
      'PUT /vercel/conexao': resposta(400, { erros: [{ campo: 'token', mensagem: 'Token inválido ou sem permissão' }] }),
    });
    render(<ConexaoVercel />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Token da Vercel'), 'ruim');
    await user.click(screen.getByRole('button', { name: 'Conectar' }));
    expect(await screen.findByText('Token inválido ou sem permissão')).toBeInTheDocument();
  });

  it('desconecta', async () => {
    const { chamadas } = mockApi({ 'GET /vercel/estado': CONECTADO, 'DELETE /vercel/conexao': resposta(204) });
    render(<ConexaoVercel />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Desconectar' }));
    expect(await screen.findByLabelText('Token da Vercel')).toBeInTheDocument();
    expect(chamadas.some((c) => c.metodo === 'DELETE' && c.caminho === '/vercel/conexao')).toBe(true);
  });

  it('salva o prazo entre avisar e tirar do ar', async () => {
    const { chamadas } = mockApi({
      'GET /vercel/estado': CONECTADO,
      'PUT /vercel/prazo': { conectado: true, prazo_dias: 10 },
    });
    render(<ConexaoVercel />);
    const user = userEvent.setup();
    const campo = await screen.findByLabelText('Dias entre avisar o cliente e tirar do ar');
    expect(campo).toHaveValue(7);
    await user.clear(campo);
    await user.type(campo, '10');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Prazo salvo.')).toBeInTheDocument();
    expect(chamadas.find((c) => c.caminho === '/vercel/prazo').corpo).toEqual({ dias: 10 });
  });
});
