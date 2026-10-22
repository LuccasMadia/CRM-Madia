import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Financeiro } from './Financeiro.jsx';
import { mockApi } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';
import { hojeISO } from '../lib/datas.js';
import { mesesDoAno } from '../lib/resumoFinanceiro.js';

vi.mock('recharts', async () => (await import('../test/mockRecharts.js')).rechartsFalso);

const mesAtual = hojeISO().slice(0, 7);
const parcela = {
  id: 1, projeto_id: 5, projeto_titulo: 'Site Ana', cliente_nome: 'Ana', descricao: 'Entrada',
  valor_centavos: 150000, vencimento: '2026-09-10', estado: 'atrasada', servico: 'site_sistema', cliente_id: 1,
};
// Visão geral pede /ferramentas de cada mês já corrido do ano
const ferramentasVazias = Object.fromEntries(
  mesesDoAno(hojeISO().slice(0, 4)).filter((m) => m <= mesAtual)
    .map((m) => [`GET /ferramentas?mes=${m}`, { mes: m, ferramentas: [], total_mes_centavos: 0 }]),
);
const recebimentos = { rota: '/financeiro?aba=recebimentos', padrao: '/financeiro' };

describe('Financeiro — abas', () => {
  it('abre na Visão geral e troca para Recebimentos e Custos', async () => {
    mockApi({ 'GET /parcelas': [], 'GET /placas/lotes': [], 'GET /placas/materiais': [], ...ferramentasVazias });
    renderizar(<Financeiro />, { rota: '/financeiro', padrao: '/financeiro' });
    expect(screen.getByRole('tab', { name: 'Visão geral' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('Faturamento x custos')).toBeInTheDocument();
    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole('tab', { name: 'Recebimentos' }));
    expect(await screen.findByText('Nenhuma parcela com esses filtros.')).toBeInTheDocument();
    await usuario.click(screen.getByRole('tab', { name: 'Custos' }));
    expect(await screen.findByText('Nenhuma ferramenta cadastrada.')).toBeInTheDocument();
    expect(await screen.findByText('Nenhuma compra de material registrada.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Estado')).not.toBeInTheDocument();
  });

  it('link antigo para ?aba=ferramentas abre Custos', async () => {
    mockApi({ 'GET /placas/lotes': [], 'GET /placas/materiais': [], ...ferramentasVazias });
    renderizar(<Financeiro />, { rota: '/financeiro?aba=ferramentas', padrao: '/financeiro' });
    expect(screen.getByRole('tab', { name: 'Custos' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('Nenhuma ferramenta cadastrada.')).toBeInTheDocument();
  });
});

describe('Financeiro — Recebimentos', () => {
  it('lista parcelas com resumo por estado e filtra por estado', async () => {
    const { chamadas } = mockApi({
      'GET /parcelas': [parcela],
      'GET /parcelas?estado=atrasada': [parcela],
    });
    renderizar(<Financeiro />, recebimentos);
    expect(await screen.findByRole('link', { name: 'Site Ana' })).toHaveAttribute('href', '/projetos/5');
    // resumo do topo soma a parcela atrasada que está na lista
    expect(screen.getByText('Atrasado').nextSibling).toHaveTextContent('1.500,00');
    expect(screen.getByText('Recebido').nextSibling).toHaveTextContent('0,00');
    const usuario = userEvent.setup();
    await usuario.selectOptions(screen.getByLabelText('Estado'), 'atrasada');
    await screen.findByRole('link', { name: 'Site Ana' });
    expect(chamadas.map((c) => c.caminho)).toContain('/parcelas?estado=atrasada');
    await usuario.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(screen.getByLabelText('Estado')).toHaveValue('');
  });

  it('mostra o serviço, filtra por ele e leva GMN para o perfil do cliente', async () => {
    const parcelaGmn = { ...parcela, id: 2, projeto_id: 6, projeto_titulo: 'Google Meu Negócio', servico: 'google_meu_negocio' };
    const { chamadas } = mockApi({
      'GET /parcelas': [parcela, parcelaGmn],
      'GET /parcelas?servico=google_meu_negocio': [parcelaGmn],
    });
    renderizar(<Financeiro />, recebimentos);
    expect(await screen.findByRole('link', { name: 'Google Meu Negócio' })).toHaveAttribute('href', '/clientes/1?aba=gmn');
    expect(screen.getByRole('link', { name: 'Site Ana' })).toHaveAttribute('href', '/projetos/5');
    expect(screen.getByRole('cell', { name: 'GMN' })).toBeInTheDocument();
    await userEvent.setup().selectOptions(screen.getByLabelText('Serviço'), 'google_meu_negocio');
    expect(chamadas.some((c) => c.caminho === '/parcelas?servico=google_meu_negocio')).toBe(true);
  });

  it('mostra a venda de placa como linha, com link para Placas › Vendas, sem colidir com parcela de mesmo id', async () => {
    const venda = {
      tipo: 'venda_placa', id: 1, projeto_titulo: 'Placa 10x10 × 1', cliente_nome: 'Rango do Bicho', descricao: 'Venda de placas',
      valor_centavos: 8000, vencimento: '2026-10-02', estado: 'atrasada', servico: 'placas_nfc', cliente_id: 7,
    };
    mockApi({ 'GET /parcelas': [{ ...parcela, tipo: 'parcela' }, venda] });
    renderizar(<Financeiro />, recebimentos);
    expect(await screen.findByRole('link', { name: 'Placa 10x10 × 1' })).toHaveAttribute('href', '/servicos?aba=placas&placas=vendas');
    expect(screen.getByRole('link', { name: 'Site Ana' })).toBeInTheDocument();
  });

  it('projeto com o mesmo nome do cliente vira o próprio link, sem repetir o nome', async () => {
    mockApi({ 'GET /parcelas': [{ ...parcela, projeto_titulo: 'Ana' }] });
    renderizar(<Financeiro />, recebimentos);
    expect(await screen.findByRole('link', { name: 'Ana' })).toHaveAttribute('href', '/projetos/5');
    expect(screen.getAllByText('Ana')).toHaveLength(1);
  });
});
