import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConexaoApple } from './ConexaoApple.jsx';
import { mockApi, resposta } from '../../test/mockApi.js';

const TRABALHO = { href: 'https://x/trabalho/', nome: 'Trabalho', cor: '#38bdf8', visivel: true };
const PESSOAL = { href: 'https://x/pessoal/', nome: 'Pessoal', cor: '#f472b6', visivel: true };
const SEM_CONEXAO = { conectado: false, usuario: null, calendarios: [], padrao: null, ultima_sync: null, erro: null };
const PRONTO = { conectado: true, usuario: 'eu@icloud.com', calendarios: [TRABALHO, PESSOAL], padrao: TRABALHO.href, ultima_sync: '2026-10-15T13:30:00.000Z', erro: null };

describe('ConexaoApple', () => {
  it('conecta com o Apple ID e a senha de app e mostra os calendários encontrados', async () => {
    const { chamadas } = mockApi({ 'GET /calendario': SEM_CONEXAO, 'PUT /calendario/conexao': PRONTO });
    render(<ConexaoApple />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Apple ID'), 'eu@icloud.com');
    await user.type(screen.getByLabelText('Senha de app'), 'abcd-efgh-ijkl-mnop');
    await user.click(screen.getByRole('button', { name: 'Conectar' }));
    expect(await screen.findByText(/Conectado como eu@icloud\.com/)).toBeInTheDocument();
    expect(chamadas.find((c) => c.metodo === 'PUT').corpo).toEqual({ usuario: 'eu@icloud.com', senha: 'abcd-efgh-ijkl-mnop' });
    expect(screen.queryByLabelText('Senha de app')).toBeNull();
    expect(screen.getByRole('list', { name: 'Calendários da conta' })).toHaveTextContent('Trabalho');
    expect(screen.getByRole('list', { name: 'Calendários da conta' })).toHaveTextContent('Pessoal');
    expect(screen.getByText(/todos os calendários.*sincronizam/i)).toBeInTheDocument();
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

  it('escolhe o calendário onde caem os eventos novos', async () => {
    const { chamadas } = mockApi({ 'GET /calendario': PRONTO, 'PUT /calendario/padrao': { ...PRONTO, padrao: PESSOAL.href } });
    render(<ConexaoApple />);
    const user = userEvent.setup();
    expect(await screen.findByLabelText('Calendário padrão')).toHaveValue(TRABALHO.href);
    await user.selectOptions(screen.getByLabelText('Calendário padrão'), 'Pessoal');
    await userEvent.setup().click(document.body);
    await screen.findByDisplayValue('Pessoal');
    expect(chamadas.find((c) => c.metodo === 'PUT').corpo).toEqual({ href: PESSOAL.href });
  });

  it('pode criar o calendário "CRM Madia", que some do botão depois de existir', async () => {
    const comCrm = { ...PRONTO, calendarios: [...PRONTO.calendarios, { href: 'https://x/crm/', nome: 'CRM Madia', cor: '#a3e635', visivel: true }], padrao: 'https://x/crm/' };
    const { chamadas } = mockApi({ 'GET /calendario': PRONTO, 'POST /calendario/calendarios': comCrm });
    render(<ConexaoApple />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Criar o calendário CRM Madia' }));
    await vi.waitFor(() => expect(screen.getByRole('list', { name: 'Calendários da conta' })).toHaveTextContent('CRM Madia'));
    expect(chamadas.find((c) => c.metodo === 'POST').corpo).toEqual({ nome: 'CRM Madia' });
    expect(screen.queryByRole('button', { name: 'Criar o calendário CRM Madia' })).toBeNull();
  });

  it('sem nenhum calendário de eventos na conta, avisa e oferece criar o CRM Madia', async () => {
    mockApi({ 'GET /calendario': { ...PRONTO, calendarios: [], padrao: null } });
    render(<ConexaoApple />);
    expect(await screen.findByText(/Nenhum calendário de eventos encontrado/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Calendário padrão')).toBeNull();
    expect(screen.getByRole('button', { name: 'Criar o calendário CRM Madia' })).toBeInTheDocument();
  });

  it('pronto: mostra a conta e a última sincronização', async () => {
    mockApi({ 'GET /calendario': PRONTO });
    render(<ConexaoApple />);
    expect(await screen.findByText(/Conectado como eu@icloud\.com/)).toBeInTheDocument();
    expect(screen.getByText(/última sincronização/i)).toBeInTheDocument();
  });

  it('Sincronizar agora mostra o resumo', async () => {
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
    mockApi({ 'GET /calendario': { ...PRONTO, erro: 'O iCloud respondeu 500.' } });
    render(<ConexaoApple />);
    expect(await screen.findByText(/O iCloud respondeu 500\./)).toBeInTheDocument();
  });

  it('Desconectar volta ao formulário', async () => {
    mockApi({ 'GET /calendario': PRONTO, 'DELETE /calendario/conexao': SEM_CONEXAO });
    render(<ConexaoApple />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Desconectar' }));
    expect(await screen.findByLabelText('Apple ID')).toBeInTheDocument();
  });
});
