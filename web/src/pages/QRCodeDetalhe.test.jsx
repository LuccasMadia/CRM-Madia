import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QRCodeDetalhe } from './QRCodeDetalhe.jsx';
import { mockApi, resposta } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';

const ana = { id: 1, nome: 'Ana' };
const qr = {
  id: 5, cliente_id: 1, nome: 'QR balcão', categoria: 'adesivo', descricao_local: 'Porta de entrada',
  destino_atual: 'https://canva.com/design/abc', imagem_arquivo: null, status: 'ativo', atualizado_em: 'T1',
  historico: [],
};

describe('QRCodeDetalhe', () => {
  it('mostra os dados', async () => {
    mockApi({ 'GET /clientes': [ana], 'GET /qrcodes/5': qr });
    renderizar(<QRCodeDetalhe />, { rota: '/qrcodes/5', padrao: '/qrcodes/:id' });
    expect(await screen.findByDisplayValue('QR balcão')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://canva.com/design/abc')).toBeInTheDocument();
  });

  it('edita o destino', async () => {
    const { chamadas } = mockApi({
      'GET /clientes': [ana],
      'GET /qrcodes/5': qr,
      'PUT /qrcodes/5': { ...qr, destino_atual: 'https://canva.com/design/novo' },
    });
    renderizar(<QRCodeDetalhe />, { rota: '/qrcodes/5', padrao: '/qrcodes/:id' });
    const user = userEvent.setup();
    const campo = await screen.findByLabelText('Destino atual');
    await user.clear(campo);
    await user.type(campo, 'https://canva.com/design/novo');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await screen.findByDisplayValue('https://canva.com/design/novo');
    expect(chamadas.find((c) => c.metodo === 'PUT').corpo).toMatchObject({ destino_atual: 'https://canva.com/design/novo' });
  });

  it('exclui com confirmação e volta pra lista', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockApi({ 'GET /clientes': [ana], 'GET /qrcodes/5': qr, 'DELETE /qrcodes/5': resposta(204, null) });
    renderizar(<QRCodeDetalhe />, { rota: '/qrcodes/5', padrao: '/qrcodes/:id' });
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Excluir' }));
    expect(await screen.findByText('Outra página')).toBeInTheDocument();
  });

  it('upload de PNG mostra preview de imagem', async () => {
    mockApi({
      'GET /clientes': [ana],
      'GET /qrcodes/5': qr,
      'POST /qrcodes/5/imagem': { ...qr, imagem_arquivo: 'abc.png' },
    });
    renderizar(<QRCodeDetalhe />, { rota: '/qrcodes/5', padrao: '/qrcodes/:id' });
    const arquivo = new File(['x'], 'qr.png', { type: 'image/png' });
    fireEvent.change(await screen.findByLabelText('Adicionar arquivo'), { target: { files: [arquivo] } });
    expect(await screen.findByAltText('Arquivo do QR code')).toHaveAttribute('src', '/uploads/abc.png');
  });

  it('upload de PDF mostra preview embutido', async () => {
    mockApi({
      'GET /clientes': [ana],
      'GET /qrcodes/5': qr,
      'POST /qrcodes/5/imagem': { ...qr, imagem_arquivo: 'abc.pdf' },
    });
    renderizar(<QRCodeDetalhe />, { rota: '/qrcodes/5', padrao: '/qrcodes/:id' });
    const arquivo = new File(['x'], 'qr.pdf', { type: 'application/pdf' });
    fireEvent.change(await screen.findByLabelText('Adicionar arquivo'), { target: { files: [arquivo] } });
    expect(await screen.findByTitle('Arquivo do QR code')).toHaveAttribute('src', '/uploads/abc.pdf');
  });

  it('remove o arquivo', async () => {
    const comImagem = { ...qr, imagem_arquivo: 'abc.png' };
    mockApi({
      'GET /clientes': [ana],
      'GET /qrcodes/5': comImagem,
      'DELETE /qrcodes/5/imagem': { ...qr, imagem_arquivo: null },
    });
    renderizar(<QRCodeDetalhe />, { rota: '/qrcodes/5', padrao: '/qrcodes/:id' });
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Remover arquivo' }));
    await screen.findByLabelText('Adicionar arquivo');
  });
});
