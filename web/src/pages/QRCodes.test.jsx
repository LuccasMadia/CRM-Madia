import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QRCodes } from './QRCodes.jsx';
import { mockApi } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';

const ana = { id: 1, nome: 'Ana' };
const qr = {
  id: 5, cliente_id: 1, nome: 'QR balcão', categoria: 'cardapio', descricao_local: null,
  imagem_arquivo: null, status: 'ativo',
};

describe('QRCodes', () => {
  it('lista os QR codes', async () => {
    mockApi({ 'GET /clientes': [ana], 'GET /qrcodes?': [qr] });
    renderizar(<QRCodes />, { rota: '/qrcodes', padrao: '/qrcodes' });
    expect(await screen.findByRole('link', { name: 'QR balcão' })).toHaveAttribute('href', '/qrcodes/5');
    const tabela = within(screen.getByRole('table'));
    expect(tabela.getByText('Ana')).toBeInTheDocument();
    expect(tabela.getByText('Cardápio')).toBeInTheDocument();
  });

  it('filtra por cliente', async () => {
    const { chamadas } = mockApi({
      'GET /clientes': [ana],
      'GET /qrcodes?': [qr],
      'GET /qrcodes?cliente_id=1': [qr],
    });
    renderizar(<QRCodes />, { rota: '/qrcodes', padrao: '/qrcodes' });
    await screen.findByRole('link', { name: 'QR balcão' });
    await userEvent.setup().selectOptions(screen.getByLabelText('Filtrar por cliente'), '1');
    await screen.findByRole('link', { name: 'QR balcão' });
    expect(chamadas.at(-1).caminho).toBe('/qrcodes?cliente_id=1');
  });

  it('cria e navega para o detalhe', async () => {
    const { chamadas } = mockApi({
      'GET /clientes': [ana],
      'GET /qrcodes?': [],
      'POST /qrcodes': { ...qr, id: 9 },
    });
    renderizar(<QRCodes />, { rota: '/qrcodes', padrao: '/qrcodes' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '+ QR Code' }));
    await user.selectOptions(screen.getByLabelText('Cliente'), '1');
    await user.type(screen.getByLabelText('Nome'), 'QR balcão');
    await user.click(screen.getByRole('button', { name: 'Criar QR Code' }));
    expect(await screen.findByText('Outra página')).toBeInTheDocument();
    expect(chamadas.find((c) => c.metodo === 'POST').corpo).toMatchObject({
      cliente_id: 1, nome: 'QR balcão', categoria: 'avaliacao',
    });
  });

  it('cria QR code com cliente novo', async () => {
    const { chamadas } = mockApi({
      'GET /clientes': [ana],
      'GET /qrcodes?': [],
      'POST /qrcodes': { ...qr, id: 9, cliente_id: 3 },
    });
    renderizar(<QRCodes />, { rota: '/qrcodes', padrao: '/qrcodes' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '+ QR Code' }));
    await user.selectOptions(screen.getByLabelText('Cliente'), 'novo');
    await user.type(screen.getByLabelText('Nome do novo cliente'), 'Diego');
    await user.type(screen.getByLabelText('Nome'), 'QR balcão');
    await user.click(screen.getByRole('button', { name: 'Criar QR Code' }));
    expect(await screen.findByText('Outra página')).toBeInTheDocument();
    expect(chamadas.find((c) => c.metodo === 'POST').corpo).toMatchObject({
      novo_cliente: { nome: 'Diego' }, nome: 'QR balcão', categoria: 'avaliacao',
    });
  });
});
