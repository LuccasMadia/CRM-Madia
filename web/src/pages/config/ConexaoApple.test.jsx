import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConexaoApple } from './ConexaoApple.jsx';
import { mockApi, resposta } from '../../test/mockApi.js';

const SEM_CONEXAO = { conectado: false, usuario: null, calendario: null, ultima_sync: null, erro: null };
const SEM_CALENDARIO = { ...SEM_CONEXAO, conectado: true, usuario: 'eu@icloud.com' };
const PRONTO = { ...SEM_CALENDARIO, calendario: { href: 'https://x/trabalho/', nome: 'Trabalho' }, ultima_sync: '2026-10-15T13:30:00.000Z' };
const CALENDARIOS = [{ href: 'https://x/trabalho/', nome: 'Trabalho' }, { href: 'https://x/pessoal/', nome: 'Pessoal' }];

describe('ConexaoApple', () => {
  it('conecta com o Apple ID e a senha de app e passa para a escolha do calendário', async () => {
    const { chamadas } = mockApi({ 'GET /calendario': SEM_CONEXAO, 'PUT /calendario/conexao': SEM_CALENDARIO, 'GET /calendario/calendarios': CALENDARIOS });
    render(<ConexaoApple />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Apple ID'), 'eu@icloud.com');
    await user.type(screen.getByLabelText('Senha de app'), 'abcd-efgh-ijkl-mnop');
    await user.click(screen.getByRole('button', { name: 'Conectar' }));
    expect(await screen.findByLabelText('Calendário')).toBeInTheDocument();
    expect(chamadas.find((c) => c.metodo === 'PUT').corpo).toEqual({ usuario: 'eu@icloud.com', senha: 'abcd-efgh-ijkl-mnop' });
    expect(screen.queryByLabelText('Senha de app')).toBeNull();
  });

  it('a senha de app fica escondida e a tela explica onde ela fica guardada', async () => {
    mockApi({ 'GET /calendario': SEM_CONEXAO });
    render(<ConexaoApple />);
    expect(await screen.findByLabelText('Senha de app')).toHaveAttribute('type', 'password');
    expect(screen.getByText(/fica salva neste computador/i)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByText('Como gerar a senha de app'));
    expect(screen.getByText(/appleid\.apple\.com/)).toBeInTheDocument();
  });

  it('senha recusada aparece no campo senha', async () => {
    mockApi({ 'GET /calendario': SEM_CONEXAO, 'PUT /calendario/conexao': resposta(400, { erros: [{ campo: 'senha', mensagem: 'Apple ID ou senha de app inválidos.' }] }) });
    render(<ConexaoApple />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Apple ID'), 'eu@icloud.com');
    await user.type(screen.getByLabelText('Senha de app'), 'errada');
    await user.click(screen.getByRole('button', { name: 'Conectar' }));
    expect(await screen.findByText('Apple ID ou senha de app inválidos.')).toBeInTheDocument();
  });

  it('escolhe um calendário da lista', async () => {
    const { chamadas } = mockApi({ 'GET /calendario': SEM_CALENDARIO, 'GET /calendario/calendarios': CALENDARIOS, 'PUT /calendario/calendario': PRONTO });
    render(<ConexaoApple />);
    const user = userEvent.setup();
    await screen.findByRole('option', { name: 'Pessoal' });
    await user.selectOptions(screen.getByLabelText('Calendário'), 'Pessoal');
    await user.click(screen.getByRole('button', { name: 'Usar este calendário' }));
    expect(await screen.findByText(/Conectado como eu@icloud\.com/)).toBeInTheDocument();
    expect(chamadas.find((c) => c.metodo === 'PUT').corpo).toEqual({ href: 'https://x/pessoal/' });
  });

  it('sem nenhum calendário de eventos na conta, avisa em vez de mostrar uma lista vazia', async () => {
    mockApi({ 'GET /calendario': SEM_CALENDARIO, 'GET /calendario/calendarios': [] });
    render(<ConexaoApple />);
    expect(await screen.findByText(/Nenhum calendário de eventos encontrado/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Calendário')).toBeNull();
    expect(screen.getByRole('button', { name: 'Criar o calendário CRM Madia' })).toBeInTheDocument();
  });

  it('pode pedir para criar o calendário "CRM Madia"', async () => {
    const { chamadas } = mockApi({ 'GET /calendario': SEM_CALENDARIO, 'GET /calendario/calendarios': CALENDARIOS, 'PUT /calendario/calendario': { ...PRONTO, calendario: { href: 'https://x/crm/', nome: 'CRM Madia' } } });
    render(<ConexaoApple />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Criar o calendário CRM Madia' }));
    expect(await screen.findByText(/CRM Madia/)).toBeInTheDocument();
    expect(chamadas.find((c) => c.metodo === 'PUT').corpo).toEqual({ criar: 'CRM Madia' });
  });

  it('pronto: mostra conta, calendário e a última sincronização', async () => {
    mockApi({ 'GET /calendario': PRONTO });
    render(<ConexaoApple />);
    expect(await screen.findByText(/Conectado como eu@icloud\.com/)).toBeInTheDocument();
    expect(screen.getByText(/Trabalho/)).toBeInTheDocument();
    expect(screen.getByText(/última sincronização/i)).toBeInTheDocument();
  });

  it('Sincronizar agora mostra o resumo; falha mostra o erro', async () => {
    mockApi({ 'GET /calendario': PRONTO, 'POST /calendario/sincronizar': { lidos: 4, enviados: 1, conflitos: 0 } });
    render(<ConexaoApple />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Sincronizar agora' }));
    expect(await screen.findByText('Sincronizado: 4 lidos, 1 enviado, 0 conflitos.')).toBeInTheDocument();
  });

  it('Sincronizar agora com falha mostra o erro', async () => {
    mockApi({ 'GET /calendario': PRONTO, 'POST /calendario/sincronizar': resposta(502, { erro: 'Não foi possível falar com o iCloud. Verifique a internet.' }) });
    render(<ConexaoApple />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Sincronizar agora' }));
    expect(await screen.findByText('Não foi possível falar com o iCloud. Verifique a internet.')).toBeInTheDocument();
  });

  it('mostra o erro guardado da última sincronização', async () => {
    mockApi({ 'GET /calendario': { ...PRONTO, erro: 'O calendário escolhido não existe mais no iCloud.' } });
    render(<ConexaoApple />);
    expect(await screen.findByText(/O calendário escolhido não existe mais no iCloud\./)).toBeInTheDocument();
  });

  it('Trocar calendário reabre a lista; Desconectar volta ao formulário', async () => {
    mockApi({ 'GET /calendario': PRONTO, 'GET /calendario/calendarios': CALENDARIOS, 'DELETE /calendario/conexao': SEM_CONEXAO });
    render(<ConexaoApple />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Trocar calendário' }));
    expect(await screen.findByLabelText('Calendário')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Desconectar' }));
    expect(await screen.findByLabelText('Apple ID')).toBeInTheDocument();
  });
});
