import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ValidadeToken } from './ValidadeToken.jsx';
import { mockApi, resposta } from '../../test/mockApi.js';

const item = (extra = {}) => ({ servico: 'github', nome: 'GitHub', validade: null, validade_estado: null, dias: null, editavel: true, falhou: false, mensagem: null, ...extra });

describe('ValidadeToken', () => {
  it('não mostra nada se o serviço não está conectado', async () => {
    mockApi({ 'GET /conexoes': [] });
    const { container } = render(<ValidadeToken servico="github" />);
    await new Promise((r) => setTimeout(r, 20));
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    [{ validade: '2026-12-30', validade_estado: 'ok', dias: 34 }, 'Válido até 30/12/2026'],
    [{ validade: '2026-12-01', validade_estado: 'vence', dias: 5 }, 'Vence em 5 dias'],
    [{ validade: '2026-11-26', validade_estado: 'vence', dias: 0 }, 'Vence hoje'],
    [{ validade: '2026-11-20', validade_estado: 'venceu', dias: 6 }, 'Venceu há 6 dias'],
    [{ falhou: true, mensagem: 'Token do GitHub inválido ou sem permissão. Cole um novo em Configurações → GitHub.' }, 'Parou de funcionar: Token do GitHub inválido ou sem permissão. Cole um novo em Configurações → GitHub.'],
  ])('mostra a situação %#', async (extra, texto) => {
    mockApi({ 'GET /conexoes': [item(extra)] });
    render(<ValidadeToken servico="github" />);
    expect(await screen.findByText(texto)).toBeInTheDocument();
  });

  it('salva a data de validade e atualiza a situação', async () => {
    const { chamadas } = mockApi({
      'GET /conexoes': [item()],
      'PUT /conexoes/validade': [item({ validade: '2026-12-30', validade_estado: 'ok', dias: 34 })],
    });
    render(<ValidadeToken servico="github" />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Vence em'), '2026-12-30');
    await user.click(screen.getByRole('button', { name: 'Salvar validade' }));
    expect(await screen.findByText('Válido até 30/12/2026')).toBeInTheDocument();
    expect(chamadas.find((c) => c.metodo === 'PUT').corpo).toEqual({ servico: 'github', validade: '2026-12-30' });
  });

  it('Limpar remove a validade', async () => {
    const { chamadas } = mockApi({
      'GET /conexoes': [item({ validade: '2026-12-30', validade_estado: 'ok', dias: 34 })],
      'PUT /conexoes/validade': [item()],
    });
    render(<ValidadeToken servico="github" />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Limpar validade' }));
    expect(await screen.findByLabelText('Vence em')).toHaveValue('');
    expect(chamadas.find((c) => c.metodo === 'PUT').corpo).toEqual({ servico: 'github', validade: '' });
  });

  it('no Supabase manda a conta e acha a linha certa entre várias contas', async () => {
    const duas = [
      item({ servico: 'supabase', nome: 'Supabase', conta_id: 1, conta: 'ana@exemplo.com' }),
      item({ servico: 'supabase', nome: 'Supabase', conta_id: 2, conta: 'bia@exemplo.com', validade: '2026-12-01', validade_estado: 'vence', dias: 5 }),
    ];
    const { chamadas } = mockApi({ 'GET /conexoes': duas, 'PUT /conexoes/validade': duas });
    render(<ValidadeToken servico="supabase" contaId={2} />);
    expect(await screen.findByText('Vence em 5 dias')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Limpar validade' }));
    expect(chamadas.find((c) => c.metodo === 'PUT').corpo).toEqual({ servico: 'supabase', conta_id: 2, validade: '' });
  });

  it('Instagram mostra só a situação, sem campo para editar', async () => {
    mockApi({ 'GET /conexoes': [item({ servico: 'instagram', nome: 'Instagram', editavel: false, validade: '2026-12-01', validade_estado: 'vence', dias: 5 })] });
    render(<ValidadeToken servico="instagram" />);
    expect(await screen.findByText('Vence em 5 dias')).toBeInTheDocument();
    expect(screen.queryByLabelText('Vence em')).toBeNull();
  });

  it('mostra o erro do servidor quando a data é recusada', async () => {
    mockApi({ 'GET /conexoes': [item()], 'PUT /conexoes/validade': resposta(400, { erros: [{ campo: 'validade', mensagem: 'Informe uma data válida' }] }) });
    render(<ValidadeToken servico="github" />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Vence em'), '2026-12-30');
    await user.click(screen.getByRole('button', { name: 'Salvar validade' }));
    expect(await screen.findByText('Informe uma data válida')).toBeInTheDocument();
  });
});
