import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConexaoSupabase } from './ConexaoSupabase.jsx';
import { mockApi, resposta } from '../../test/mockApi.js';

const SEM_CONTAS = { conectado: false, contas: [] };
const UMA = { conectado: true, contas: [{ id: 1, email: 'ana@exemplo.com' }] };
const DUAS = { conectado: true, contas: [{ id: 1, email: 'ana@exemplo.com' }, { id: 2, email: 'bia@exemplo.com' }] };

describe('ConexaoSupabase', () => {
  it('adiciona uma conta com nome e token e limpa o formulário', async () => {
    const { chamadas } = mockApi({ 'GET /supabase': SEM_CONTAS, 'POST /supabase/contas': UMA });
    render(<ConexaoSupabase />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('E-mail da conta'), 'ana@exemplo.com');
    await user.type(screen.getByLabelText('Token do Supabase'), 'sbp_abc');
    await user.click(screen.getByRole('button', { name: 'Adicionar conta' }));
    expect(await screen.findByText('ana@exemplo.com')).toBeInTheDocument();
    expect(chamadas.find((c) => c.metodo === 'POST').corpo).toEqual({ email: 'ana@exemplo.com', token: 'sbp_abc' });
    expect(screen.getByLabelText('Token do Supabase')).toHaveValue('');
  });

  it('lista as várias contas e mostra erros de nome e de token nos campos', async () => {
    mockApi({
      'GET /supabase': DUAS,
      'POST /supabase/contas': resposta(400, { erros: [{ campo: 'email', mensagem: 'Já existe uma conta com esse e-mail' }, { campo: 'token', mensagem: 'Token inválido ou sem permissão' }] }),
    });
    render(<ConexaoSupabase />);
    expect(await screen.findByText('bia@exemplo.com')).toBeInTheDocument();
    expect(screen.getByText('ana@exemplo.com')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('E-mail da conta'), 'ana@exemplo.com');
    await user.type(screen.getByLabelText('Token do Supabase'), 'ruim');
    await user.click(screen.getByRole('button', { name: 'Adicionar conta' }));
    expect(await screen.findByText('Já existe uma conta com esse e-mail')).toBeInTheDocument();
    expect(screen.getByText('Token inválido ou sem permissão')).toBeInTheDocument();
  });

  it('remove uma conta', async () => {
    const { chamadas } = mockApi({ 'GET /supabase': DUAS, 'DELETE /supabase/contas/2': UMA });
    render(<ConexaoSupabase />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Remover bia@exemplo.com' }));
    expect(await screen.findByText('ana@exemplo.com')).toBeInTheDocument();
    expect(screen.queryByText('bia@exemplo.com')).toBeNull();
    expect(chamadas.some((c) => c.metodo === 'DELETE' && c.caminho === '/supabase/contas/2')).toBe(true);
  });
});
