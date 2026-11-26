import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConexaoSupabase } from './ConexaoSupabase.jsx';
import { mockApi, resposta } from '../../test/mockApi.js';

describe('ConexaoSupabase', () => {
  it('conecta com o token colado e mostra que está conectado', async () => {
    const { chamadas } = mockApi({ 'GET /supabase': { conectado: false }, 'PUT /supabase/conexao': { conectado: true } });
    render(<ConexaoSupabase />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Token do Supabase'), 'sbp_abc');
    await user.click(screen.getByRole('button', { name: 'Conectar' }));
    expect(await screen.findByText('Supabase conectado')).toBeInTheDocument();
    expect(chamadas.find((c) => c.metodo === 'PUT').corpo).toEqual({ token: 'sbp_abc' });
    expect(screen.queryByLabelText('Token do Supabase')).toBeNull();
  });

  it('mostra o erro de token inválido no campo', async () => {
    mockApi({
      'GET /supabase': { conectado: false },
      'PUT /supabase/conexao': resposta(400, { erros: [{ campo: 'token', mensagem: 'Token inválido ou sem permissão' }] }),
    });
    render(<ConexaoSupabase />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Token do Supabase'), 'ruim');
    await user.click(screen.getByRole('button', { name: 'Conectar' }));
    expect(await screen.findByText('Token inválido ou sem permissão')).toBeInTheDocument();
  });

  it('desconecta e volta ao formulário', async () => {
    const { chamadas } = mockApi({ 'GET /supabase': { conectado: true }, 'DELETE /supabase/conexao': { conectado: false } });
    render(<ConexaoSupabase />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Desconectar' }));
    expect(await screen.findByLabelText('Token do Supabase')).toBeInTheDocument();
    expect(chamadas.some((c) => c.metodo === 'DELETE' && c.caminho === '/supabase/conexao')).toBe(true);
  });
});
