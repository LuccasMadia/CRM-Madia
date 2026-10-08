import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClienteDetalhe } from './ClienteDetalhe.jsx';
import { mockApi, resposta } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';

const cliente = {
  id: 1, nome: 'Ana', empresa: null, email: null, telefone: null, instagram: null, origem: null, notas: null,
  atualizado_em: 'T', total_faturado_centavos: 150050,
  projetos: [{ id: 4, titulo: 'Site', etapa: 'andamento' }],
  qrcodes: [{ id: 5, nome: 'QR balcão' }],
};

describe('ClienteDetalhe', () => {
  it('mostra projetos e total faturado', async () => {
    mockApi({ 'GET /clientes/1': cliente });
    renderizar(<ClienteDetalhe />, { rota: '/clientes/1', padrao: '/clientes/:id' });
    expect(await screen.findByRole('link', { name: 'Site' })).toHaveAttribute('href', '/projetos/4');
    expect(screen.getByText(/1\.500,50/)).toBeInTheDocument();
    expect(screen.getByText('Em andamento')).toBeInTheDocument();
  });

  it('mostra os QR codes do cliente', async () => {
    mockApi({ 'GET /clientes/1': cliente });
    renderizar(<ClienteDetalhe />, { rota: '/clientes/1', padrao: '/clientes/:id' });
    expect(await screen.findByRole('link', { name: 'QR balcão' })).toHaveAttribute('href', '/qrcodes/5');
  });

  it('mostra mensagem quando não há QR codes', async () => {
    mockApi({ 'GET /clientes/1': { ...cliente, qrcodes: [] } });
    renderizar(<ClienteDetalhe />, { rota: '/clientes/1', padrao: '/clientes/:id' });
    expect(await screen.findByText('Nenhum QR ainda.')).toBeInTheDocument();
  });

  it('mostra a mensagem quando o servidor recusa a exclusão', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockApi({
      'GET /clientes/1': cliente,
      'DELETE /clientes/1': resposta(409, { erro: 'Este cliente tem projetos.' }),
    });
    renderizar(<ClienteDetalhe />, { rota: '/clientes/1', padrao: '/clientes/:id' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Excluir' }));
    expect(await screen.findByText('Este cliente tem projetos.')).toBeInTheDocument();
  });

  it('mostra o código Pix e copia ao clicar no botão', async () => {
    mockApi({ 'GET /clientes/1': { ...cliente, pix_copia_cola: '00020126...CODIGO...6304ABCD' } });
    renderizar(<ClienteDetalhe />, { rota: '/clientes/1', padrao: '/clientes/:id' });
    expect(await screen.findByText('00020126...CODIGO...6304ABCD')).toBeInTheDocument();

    const escreverNaAreaDeTransferencia = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Copiar' }));
    expect(escreverNaAreaDeTransferencia).toHaveBeenCalledWith('00020126...CODIGO...6304ABCD');
    expect(await screen.findByRole('button', { name: 'Copiado!' })).toBeInTheDocument();
  });

  it('mostra aviso quando o cliente não tem chave Pix cadastrada', async () => {
    mockApi({ 'GET /clientes/1': { ...cliente, pix_copia_cola: null } });
    renderizar(<ClienteDetalhe />, { rota: '/clientes/1', padrao: '/clientes/:id' });
    expect(await screen.findByText('Preencha a chave Pix no formulário para gerar o código.')).toBeInTheDocument();
  });

  it('publica o pix e mostra o link completo pra copiar', async () => {
    mockApi({
      'GET /clientes/1': { ...cliente, pix_copia_cola: '00020126...CODIGO...6304ABCD' },
      'POST /clientes/1/publicar-pix': { commitado: true, saida: 'ok', url: 'https://luccasmadia.com.br/pix/1' },
    });
    renderizar(<ClienteDetalhe />, { rota: '/clientes/1', padrao: '/clientes/:id' });
    await screen.findByText('00020126...CODIGO...6304ABCD');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Publicar Pix' }));
    expect(await screen.findByText('https://luccasmadia.com.br/pix/1')).toBeInTheDocument();

    const escrever = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    await user.click(screen.getByRole('button', { name: 'Copiar link' }));
    expect(escrever).toHaveBeenCalledWith('https://luccasmadia.com.br/pix/1');
  });

  it('publica o pix sem URL do site configurada e mostra o caminho relativo', async () => {
    mockApi({
      'GET /clientes/1': { ...cliente, pix_copia_cola: '00020126...CODIGO...6304ABCD' },
      'POST /clientes/1/publicar-pix': { commitado: true, saida: 'ok', url: null },
    });
    renderizar(<ClienteDetalhe />, { rota: '/clientes/1', padrao: '/clientes/:id' });
    await screen.findByText('00020126...CODIGO...6304ABCD');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Publicar Pix' }));
    expect(await screen.findByText(/Publicado! Configure a URL do site em Configurações/)).toBeInTheDocument();
  });

  it('mostra o erro quando a publicação do pix falha', async () => {
    mockApi({
      'GET /clientes/1': { ...cliente, pix_copia_cola: '00020126...CODIGO...6304ABCD' },
      'POST /clientes/1/publicar-pix': resposta(400, { erro: 'Configure o caminho do repositório do portfólio' }),
    });
    renderizar(<ClienteDetalhe />, { rota: '/clientes/1', padrao: '/clientes/:id' });
    await screen.findByText('00020126...CODIGO...6304ABCD');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Publicar Pix' }));
    expect(await screen.findByText('Configure o caminho do repositório do portfólio')).toBeInTheDocument();
  });
});
