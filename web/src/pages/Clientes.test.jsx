import { describe, it, expect } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Clientes } from './Clientes.jsx';
import { mockApi, resposta } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';

const ana = { id: 1, nome: 'Doces da Ana', responsavel: 'Ana Souza', email: 'ana@doces.com', telefone: '67 99999-0000', instagram: '@docesdaana' };

describe('Clientes', () => {
  it('lista pela empresa, com o responsável ao lado, e busca', async () => {
    const { chamadas } = mockApi({ 'GET /clientes?busca=': [ana], 'GET /clientes?busca=doces': [ana] });
    renderizar(<Clientes />, { rota: '/clientes', padrao: '/clientes' });
    expect(await screen.findByRole('link', { name: 'Doces da Ana' })).toHaveAttribute('href', '/clientes/1');
    expect(screen.getByText('Ana Souza')).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').map((c) => c.textContent).slice(0, 4)).toEqual(['Empresa', 'Responsável', 'Instagram', 'WhatsApp']);
    expect(screen.getByRole('link', { name: '@docesdaana' })).toHaveAttribute('href', 'https://www.instagram.com/docesdaana/');
    expect(screen.getByText('67 99999-0000')).toBeInTheDocument();
    expect(screen.queryByText('ana@doces.com')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Buscar clientes'), { target: { value: 'doces' } });
    await screen.findByRole('link', { name: 'Doces da Ana' });
    expect(chamadas.at(-1).caminho).toBe('/clientes?busca=doces');
  });

  it('mostra a foto de cada cliente, ou as iniciais quando não tem', async () => {
    mockApi({ 'GET /clientes?busca=': [{ ...ana, foto: 'ana.jpg' }, { id: 2, nome: 'Barbearia Brothers', responsavel: null }] });
    renderizar(<Clientes />, { rota: '/clientes', padrao: '/clientes' });
    const [linhaAna, linhaBrothers] = (await screen.findAllByRole('row')).slice(1);
    expect(linhaAna.querySelector('img.foto-cliente')).toHaveAttribute('src', '/uploads/ana.jpg');
    expect(linhaBrothers.querySelector('.foto-cliente')).toHaveTextContent('BB');
    expect(screen.getByRole('link', { name: 'Doces da Ana' })).toBeInTheDocument();
  });

  it('lápis abre a edição na própria lista, salva e recarrega', async () => {
    let lista = [ana];
    const { chamadas } = mockApi({
      'GET /clientes?busca=': () => lista,
      'PUT /clientes/1': (corpo) => { lista = [{ ...ana, ...corpo }]; return lista[0]; },
    });
    renderizar(<Clientes />, { rota: '/clientes', padrao: '/clientes' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Editar Doces da Ana' }));
    expect(screen.getByLabelText('Empresa')).toHaveValue('Doces da Ana');
    const empresa = screen.getByLabelText('Empresa');
    await user.clear(empresa);
    await user.type(empresa, 'Doces da Ana Ltda');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('link', { name: 'Doces da Ana Ltda' })).toBeInTheDocument();
    expect(chamadas.find((c) => c.metodo === 'PUT').corpo).toMatchObject({ nome: 'Doces da Ana Ltda', responsavel: 'Ana Souza' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('o cliente próprio aparece marcado como "Você"', async () => {
    mockApi({ 'GET /clientes?busca=': [{ id: 5, nome: 'Portfólio', proprio: 1 }, { ...ana, proprio: 0 }] });
    renderizar(<Clientes />, { rota: '/clientes', padrao: '/clientes' });
    const [linhaEu, linhaAna] = (await screen.findAllByRole('row')).slice(1);
    expect(linhaEu).toHaveTextContent('Você');
    expect(linhaAna).not.toHaveTextContent('Você');
  });

  it('cliente ainda sem empresa aparece como "Sem empresa"', async () => {
    mockApi({ 'GET /clientes?busca=': [{ ...ana, id: 2, nome: '' }] });
    renderizar(<Clientes />, { rota: '/clientes', padrao: '/clientes' });
    expect(await screen.findByRole('link', { name: 'Sem empresa' })).toHaveAttribute('href', '/clientes/2');
    expect(screen.getByText('Ana Souza')).toBeInTheDocument();
  });

  it('mostra erro do servidor ao lado do campo ao criar', async () => {
    mockApi({
      'GET /clientes?busca=': [],
      'POST /clientes': resposta(400, { erros: [{ campo: 'nome', mensagem: 'Obrigatório' }] }),
    });
    renderizar(<Clientes />, { rota: '/clientes', padrao: '/clientes' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '+ Cliente' }));
    await user.click(screen.getByRole('button', { name: 'Criar cliente' }));
    expect(await screen.findByText('Obrigatório')).toBeInTheDocument();
    expect(screen.getByLabelText('Empresa')).toHaveAttribute('aria-invalid', 'true');
  });

  it('cria e navega para o detalhe', async () => {
    const { chamadas } = mockApi({ 'GET /clientes?busca=': [], 'POST /clientes': { ...ana, id: 7 } });
    renderizar(<Clientes />, { rota: '/clientes', padrao: '/clientes' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '+ Cliente' }));
    await user.type(screen.getByLabelText('Empresa'), 'Doces da Ana');
    await user.type(screen.getByLabelText('Responsável'), 'Ana Souza');
    await user.click(screen.getByRole('button', { name: 'Criar cliente' }));
    expect(await screen.findByText('Outra página')).toBeInTheDocument();
    expect(chamadas.find((c) => c.metodo === 'POST').corpo).toMatchObject({ nome: 'Doces da Ana', responsavel: 'Ana Souza' });
  });

  it('ao criar com foto, envia a foto para o cliente novo antes de abrir o perfil', async () => {
    const { chamadas } = mockApi({ 'GET /clientes?busca=': [], 'POST /clientes': { ...ana, id: 7 }, 'POST /clientes/7/foto': { ...ana, id: 7, foto: 'x.jpg' } });
    renderizar(<Clientes />, { rota: '/clientes', padrao: '/clientes' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '+ Cliente' }));
    await user.type(screen.getByLabelText('Empresa'), 'Doces da Ana');
    await user.upload(screen.getByLabelText('Foto'), new File(['img'], 'logo.png', { type: 'image/png' }));
    await user.click(screen.getByRole('button', { name: 'Criar cliente' }));
    expect(await screen.findByText('Outra página')).toBeInTheDocument();
    expect(chamadas.filter((c) => c.metodo === 'POST').map((c) => c.caminho)).toEqual(['/clientes', '/clientes/7/foto']);
  });

  it('Instagram já vem com @: basta digitar o perfil, e sem perfil vai vazio', async () => {
    const { chamadas } = mockApi({ 'GET /clientes?busca=': [], 'POST /clientes': { ...ana, id: 7 } });
    renderizar(<Clientes />, { rota: '/clientes', padrao: '/clientes' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '+ Cliente' }));
    const instagram = screen.getByLabelText('Instagram');
    expect(instagram).toHaveValue('@');
    await user.type(screen.getByLabelText('Empresa'), 'Doces da Ana');
    await user.click(screen.getByRole('button', { name: 'Criar cliente' }));
    expect(await screen.findByText('Outra página')).toBeInTheDocument();
    expect(chamadas.find((c) => c.metodo === 'POST').corpo.instagram).toBe('');
  });

  it('digitando só o nome do perfil, salva com @', async () => {
    const { chamadas } = mockApi({ 'GET /clientes?busca=': [], 'POST /clientes': { ...ana, id: 7 } });
    renderizar(<Clientes />, { rota: '/clientes', padrao: '/clientes' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '+ Cliente' }));
    await user.type(screen.getByLabelText('Empresa'), 'Doces da Ana');
    await user.type(screen.getByLabelText('Instagram'), 'docesdaana');
    await user.click(screen.getByRole('button', { name: 'Criar cliente' }));
    expect(await screen.findByText('Outra página')).toBeInTheDocument();
    expect(chamadas.find((c) => c.metodo === 'POST').corpo.instagram).toBe('@docesdaana');
  });

  it('ao editar, mantém o Instagram que já existe e não duplica o @', async () => {
    const { chamadas } = mockApi({ 'GET /clientes?busca=': [ana], 'PUT /clientes/1': (corpo) => ({ ...ana, ...corpo }) });
    renderizar(<Clientes />, { rota: '/clientes', padrao: '/clientes' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Editar Doces da Ana' }));
    const instagram = screen.getByLabelText('Instagram');
    expect(instagram).toHaveValue('@docesdaana');
    await user.clear(instagram);
    await user.type(instagram, '@@novo');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(chamadas.find((c) => c.metodo === 'PUT')?.corpo.instagram).toBe('@novo'));
  });
});
