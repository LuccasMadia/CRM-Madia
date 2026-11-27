import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { CartaoEmails } from './CartaoEmails.jsx';
import { mockApi, resposta } from '../../test/mockApi.js';
import { renderizar } from '../../test/renderizar.jsx';

const CONECTADO = { configurado: true, conectado: true, usuario: 'eu@gmail.com' };
const cliente = (extra = {}) => ({ id: 7, nome: 'Ana', email: 'ana@cliente.com', ...extra });
const CONVERSAS = {
  semEmail: false,
  conversas: [
    { id: 't1', assunto: 'Proposta', trecho: 'Segue a proposta', data: '2026-03-10T15:00:00.000Z', de: 'Ana', link: 'https://mail.google.com/mail/u/0/#all/t1' },
    { id: 't2', assunto: 'Re: Logo', trecho: 'Enviei a logo', data: '2026-03-11T15:00:00.000Z', de: 'Você', link: 'https://mail.google.com/mail/u/0/#all/t2' },
  ],
};

describe('CartaoEmails', () => {
  it('sem conexão chama para as Configurações', async () => {
    mockApi({ 'GET /gmail': { configurado: false, conectado: false, usuario: null } });
    renderizar(<CartaoEmails cliente={cliente()} />);
    expect(await screen.findByRole('link', { name: 'Conectar o Gmail' })).toHaveAttribute('href', '/configuracoes');
  });

  it('cliente sem e-mail pede o cadastro e não chama a API de e-mails', async () => {
    const { chamadas } = mockApi({ 'GET /gmail': CONECTADO });
    renderizar(<CartaoEmails cliente={cliente({ email: '' })} />);
    expect(await screen.findByText('Cadastre o e-mail do cliente para ver as conversas.')).toBeInTheDocument();
    expect(chamadas.some((c) => c.caminho.includes('/emails'))).toBe(false);
  });

  it('lista assunto, data, remetente, trecho e o link para abrir no Gmail', async () => {
    mockApi({ 'GET /gmail': CONECTADO, 'GET /clientes/7/emails': CONVERSAS });
    renderizar(<CartaoEmails cliente={cliente()} />);
    expect(await screen.findByText('Proposta')).toBeInTheDocument();
    expect(screen.getByText('10/03/2026 · Ana')).toBeInTheDocument();
    expect(screen.getByText('11/03/2026 · Você')).toBeInTheDocument();
    expect(screen.getByText('Segue a proposta')).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: /Abrir no Gmail/ });
    expect(links[0]).toHaveAttribute('href', 'https://mail.google.com/mail/u/0/#all/t1');
    expect(links[0]).toHaveAttribute('target', '_blank');
  });

  it('sem conversas mostra a mensagem de vazio', async () => {
    mockApi({ 'GET /gmail': CONECTADO, 'GET /clientes/7/emails': { conversas: [], semEmail: false } });
    renderizar(<CartaoEmails cliente={cliente()} />);
    expect(await screen.findByText('Nenhuma conversa com esse e-mail.')).toBeInTheDocument();
  });

  it('token revogado mostra o chamado para reconectar sem derrubar o resto', async () => {
    mockApi({
      'GET /gmail': CONECTADO,
      'GET /clientes/7/emails': resposta(502, { erro: 'Gmail desconectado. Conecte de novo em Configurações → Gmail.' }),
    });
    renderizar(<CartaoEmails cliente={cliente()} />);
    expect(await screen.findByText(/Gmail desconectado/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Reconectar o Gmail' })).toHaveAttribute('href', '/configuracoes');
  });
});
