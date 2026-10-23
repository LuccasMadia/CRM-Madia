import { describe, it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GoogleMeuNegocio } from './GoogleMeuNegocio.jsx';
import { mockApi, resposta } from '../../test/mockApi.js';
import { renderizar } from '../../test/renderizar.jsx';
import { hojeISO } from '../../lib/datas.js';

const DIA = 86400000;
const haDias = (n) => new Date(Date.now() - n * DIA).toISOString();
const daquiDias = (n) => new Date(Date.now() + n * DIA).toLocaleDateString('sv-SE');

const base = { servico: 'google_meu_negocio', titulo: 'Google Meu Negócio', valor_total_centavos: 20000, mensalidade_ativa: 0, notas: null, atualizado_em: 'T' };
const recente = { ...base, id: 1, cliente_id: 10, cliente_nome: 'Padaria Ana', etapa: 'andamento', criado_em: haDias(3), link_perfil: 'https://g.page/ana' };
const antigo = { ...base, id: 2, cliente_id: 11, cliente_nome: 'Oficina Bruno', etapa: 'andamento', criado_em: haDias(12), link_perfil: null };
const configurado = { ...base, id: 3, cliente_id: 12, cliente_nome: 'Clínica Carla', etapa: 'entregue', data_entrega: '2026-09-20', criado_em: haDias(60) };
const perdido = { ...base, id: 4, cliente_id: 13, cliente_nome: 'Loja Davi', etapa: 'perdido', criado_em: haDias(90) };

const parcela = (id, projeto, extra) => ({
  tipo: 'parcela', id, projeto_id: projeto.id, cliente_id: projeto.cliente_id, cliente_nome: projeto.cliente_nome,
  servico: 'google_meu_negocio', descricao: 'Pagamento', valor_centavos: 20000, pago_em: null, mensalidade: 0, ...extra,
});
const atrasada = parcela(30, antigo, { vencimento: '2020-01-10', estado: 'atrasada' });
const vencendo = parcela(31, recente, { vencimento: daquiDias(3), estado: 'pendente' });
const paga = parcela(32, configurado, { vencimento: '2026-09-01', estado: 'paga', pago_em: '2026-09-01' });

const rotas = (extra = {}) => ({
  'GET /projetos?servico=google_meu_negocio': [configurado, recente, perdido, antigo],
  'GET /parcelas?servico=google_meu_negocio': [atrasada, vencendo, paga],
  ...extra,
});
const abrir = () => renderizar(<GoogleMeuNegocio />, { rota: '/servicos?aba=gmn', padrao: '/servicos' });
const linhaDe = async (nome) => (await screen.findByRole('link', { name: nome })).closest('tr');

describe('Serviços › Google Meu Negócio', () => {
  it('pede atenção: pendentes com a maior espera e parcelas atrasadas e vencendo, com link para Recebimentos', async () => {
    mockApi(rotas());
    abrir();
    const faixa = await screen.findByRole('region', { name: 'Pede atenção' });
    expect(within(faixa).getByText('2 pendentes de configurar · o mais antigo há 12 dias')).toHaveClass('pede-atencao__item--atencao');
    const atraso = within(faixa).getByRole('link', { name: /1 parcela atrasada · R\$\s200,00/ });
    expect(atraso).toHaveAttribute('href', '/financeiro?aba=recebimentos');
    expect(atraso).toHaveClass('pede-atencao__item--perigo');
    expect(within(faixa).getByRole('link', { name: /1 parcela vence em até 7 dias/ })).toHaveClass('pede-atencao__item--atencao');
  });

  it('sem nada pendente, a faixa diz isso', async () => {
    mockApi(rotas({ 'GET /projetos?servico=google_meu_negocio': [configurado], 'GET /parcelas?servico=google_meu_negocio': [paga] }));
    abrir();
    expect(await screen.findByText('Nada pendente por aqui')).toBeInTheDocument();
  });

  it('lista pendentes (mais antigo primeiro) e depois configurados, sem select; perdidos só pelo filtro', async () => {
    mockApi(rotas());
    abrir();
    await screen.findByRole('link', { name: 'Padaria Ana' });
    expect(screen.queryByRole('combobox')).toBeNull();
    const linhas = screen.getAllByRole('row').slice(1).map((l) => l.textContent);
    expect(linhas[0]).toBe('Pendentes (2)');
    expect(linhas[1]).toMatch(/Oficina Bruno.*Pendente há 12 dias/);
    expect(linhas[2]).toMatch(/Padaria Ana/);
    expect(linhas[3]).toBe('Configurados (1)');
    expect(linhas[4]).toMatch(/Clínica Carla.*Configurado em 20\/09\/2026/);
    expect(screen.getByRole('link', { name: 'Padaria Ana' })).toHaveAttribute('href', '/clientes/10?aba=gmn');
    expect(screen.getByRole('link', { name: /Ver perfil no Google/ })).toHaveAttribute('href', 'https://g.page/ana');
    expect(screen.queryByText('Loja Davi')).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Perdidos (1)' }));
    expect(screen.getByRole('link', { name: 'Loja Davi' })).toBeInTheDocument();
  });

  it('marca configurado e marca pago direto na linha', async () => {
    const { chamadas } = mockApi(rotas({
      'PUT /projetos/2': { ...antigo, etapa: 'entregue' },
      'PUT /parcelas/30': { ...atrasada, pago_em: hojeISO() },
    }));
    abrir();
    const linha = await linhaDe('Oficina Bruno');
    expect(within(await linhaDe('Clínica Carla')).queryByRole('button', { name: 'Marcar configurado' })).toBeNull();
    const user = userEvent.setup();
    await user.click(within(linha).getByRole('button', { name: 'Marcar configurado' }));
    await waitFor(() => expect(chamadas.find((c) => c.metodo === 'PUT' && c.caminho === '/projetos/2')?.corpo).toEqual({ etapa: 'entregue' }));
    expect(within(linha).getByText(/a receber \(vence 10\/01\/2020\)/)).toBeInTheDocument();
    await user.click(within(linha).getByRole('button', { name: 'Marcar pago' }));
    await waitFor(() => expect(chamadas.find((c) => c.caminho === '/parcelas/30')?.corpo).toEqual({ pago_em: hojeISO() }));
  });

  it('+ Google Meu Negócio pede o cliente e cria com o mesmo formulário do perfil', async () => {
    const { chamadas } = mockApi(rotas({
      'GET /clientes': [{ id: 10, nome: 'Padaria Ana' }, { id: 20, nome: 'Bar do Zé' }],
      'POST /projetos': { ...base, id: 9 },
    }));
    abrir();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '+ Google Meu Negócio' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Novo Google Meu Negócio' });
    await user.type(await within(dialogo).findByLabelText('Valor (R$)'), '150');
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }));
    expect(within(dialogo).getByText('Escolha o cliente')).toBeInTheDocument();
    await user.selectOptions(within(dialogo).getByLabelText('Cliente'), 'Bar do Zé');
    await user.type(within(dialogo).getByLabelText('Vencimento'), '2026-11-05');
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(chamadas.find((c) => c.metodo === 'POST')?.corpo).toEqual({
      servico: 'google_meu_negocio', titulo: 'Google Meu Negócio', cliente_id: 20,
      valor_total_centavos: 15000, vencimento: '2026-11-05', mensalidade_ativa: false, link_perfil: '', notas: '',
    }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('editar abre o formulário preenchido e salva com PUT', async () => {
    const { chamadas } = mockApi(rotas({ 'PUT /projetos/1': { ...recente, link_perfil: 'https://g.page/ana2' } }));
    abrir();
    await userEvent.setup().click(within(await linhaDe('Padaria Ana')).getByRole('button', { name: 'Editar Google Meu Negócio de Padaria Ana' }));
    const dialogo = screen.getByRole('dialog', { name: 'Editar Google Meu Negócio' });
    expect(within(dialogo).queryByLabelText('Cliente')).toBeNull();
    const link = within(dialogo).getByLabelText('Link do perfil');
    expect(link).toHaveValue('https://g.page/ana');
    const user = userEvent.setup();
    await user.clear(link);
    await user.type(link, 'https://g.page/ana2');
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(chamadas.find((c) => c.metodo === 'PUT' && c.caminho === '/projetos/1')?.corpo).toMatchObject({
      link_perfil: 'https://g.page/ana2', valor_total_centavos: 20000,
    }));
  });

  it('excluir pede confirmação antes do DELETE', async () => {
    const { chamadas } = mockApi(rotas({ 'DELETE /projetos/3': resposta(204) }));
    abrir();
    const user = userEvent.setup();
    await user.click(within(await linhaDe('Clínica Carla')).getByRole('button', { name: 'Excluir Google Meu Negócio de Clínica Carla' }));
    expect(chamadas.some((c) => c.metodo === 'DELETE')).toBe(false);
    await user.click(within(screen.getByRole('dialog', { name: 'Excluir Google Meu Negócio?' })).getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(chamadas.some((c) => c.metodo === 'DELETE' && c.caminho === '/projetos/3')).toBe(true));
  });
});
