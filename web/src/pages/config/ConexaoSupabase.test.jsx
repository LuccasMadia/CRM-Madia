import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConexaoSupabase } from './ConexaoSupabase.jsx';
import { mockApi, resposta } from '../../test/mockApi.js';

const SEM_CONTAS = { conectado: false, contas: [] };
const UMA = { conectado: true, contas: [{ id: 1, nome: 'Conta 1' }] };
const DUAS = { conectado: true, contas: [{ id: 1, nome: 'Conta 1' }, { id: 2, nome: 'Conta 2' }] };

describe('ConexaoSupabase', () => {
  it('adiciona uma conta com nome e token e limpa o formulário', async () => {
    const { chamadas } = mockApi({ 'GET /supabase': SEM_CONTAS, 'POST /supabase/contas': UMA });
    render(<ConexaoSupabase />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Nome da conta'), 'Conta 1');
    await user.type(screen.getByLabelText('Token do Supabase'), 'sbp_abc');
    await user.click(screen.getByRole('button', { name: 'Adicionar conta' }));
    expect(await screen.findByText('Conta 1')).toBeInTheDocument();
    expect(chamadas.find((c) => c.metodo === 'POST').corpo).toEqual({ nome: 'Conta 1', token: 'sbp_abc' });
    expect(screen.getByLabelText('Token do Supabase')).toHaveValue('');
  });

  it('lista as várias contas e mostra erros de nome e de token nos campos', async () => {
    mockApi({
      'GET /supabase': DUAS,
      'POST /supabase/contas': resposta(400, { erros: [{ campo: 'nome', mensagem: 'Já existe uma conta com esse nome' }, { campo: 'token', mensagem: 'Token inválido ou sem permissão' }] }),
    });
    render(<ConexaoSupabase />);
    expect(await screen.findByText('Conta 2')).toBeInTheDocument();
    expect(screen.getByText('Conta 1')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Nome da conta'), 'Conta 1');
    await user.type(screen.getByLabelText('Token do Supabase'), 'ruim');
    await user.click(screen.getByRole('button', { name: 'Adicionar conta' }));
    expect(await screen.findByText('Já existe uma conta com esse nome')).toBeInTheDocument();
    expect(screen.getByText('Token inválido ou sem permissão')).toBeInTheDocument();
  });

  it('remove uma conta', async () => {
    const { chamadas } = mockApi({ 'GET /supabase': DUAS, 'DELETE /supabase/contas/2': UMA });
    render(<ConexaoSupabase />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Remover Conta 2' }));
    expect(await screen.findByText('Conta 1')).toBeInTheDocument();
    expect(screen.queryByText('Conta 2')).toBeNull();
    expect(chamadas.some((c) => c.metodo === 'DELETE' && c.caminho === '/supabase/contas/2')).toBe(true);
  });
});
