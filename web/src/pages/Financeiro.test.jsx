import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Financeiro } from './Financeiro.jsx';
import { mockApi } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';
import { hojeISO } from '../lib/datas.js';

const ano = hojeISO().slice(0, 4);
const meses = Array.from({ length: 12 }, (_, i) => ({ mes: `${ano}-${String(i + 1).padStart(2, '0')}`, recebido_centavos: i === 8 ? 450000 : 0 }));
const parcela = {
  id: 1, projeto_id: 5, projeto_titulo: 'Site Ana', cliente_nome: 'Ana', descricao: 'Entrada',
  valor_centavos: 150000, vencimento: '2026-09-10', estado: 'atrasada', servico: 'site_sistema', cliente_id: 1,
};

describe('Financeiro — abas', () => {
  it('abre em Recebimentos e troca para Ferramentas', async () => {
    const mesAtual = hojeISO().slice(0, 7);
    mockApi({
      'GET /parcelas': [],
      [`GET /financeiro/mensal?ano=${ano}`]: meses,
      [`GET /ferramentas?mes=${mesAtual}`]: { mes: mesAtual, ferramentas: [], total_mes_centavos: 0 },
    });
    renderizar(<Financeiro />);
    expect(screen.getByRole('tab', { name: 'Recebimentos' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('Nenhuma parcela com esses filtros.')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Ferramentas' }));
    expect(await screen.findByText('Nenhuma ferramenta cadastrada.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Estado')).not.toBeInTheDocument();
  });
});

describe('Financeiro', () => {
  it('lista parcelas, total e recebido por mês; filtra por estado', async () => {
    const { chamadas } = mockApi({
      'GET /parcelas': [parcela],
      'GET /parcelas?estado=atrasada': [parcela],
      [`GET /financeiro/mensal?ano=${ano}`]: meses,
    });
    renderizar(<Financeiro />, { rota: '/financeiro', padrao: '/financeiro' });
    expect(await screen.findByRole('link', { name: 'Site Ana' })).toHaveAttribute('href', '/projetos/5');
    const grafico = await screen.findByRole('list', { name: 'Recebido por mês' });
    expect(within(grafico).getByText(/4\.500,00/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: `Recebido em ${ano}` }).nextSibling).toHaveTextContent('4.500,00');
    // resumo do topo soma a parcela atrasada que está na lista
    expect(screen.getByText('Atrasado').nextSibling).toHaveTextContent('1.500,00');
    await userEvent.setup().selectOptions(screen.getByLabelText('Estado'), 'atrasada');
    await screen.findByRole('link', { name: 'Site Ana' });
    expect(chamadas.map((c) => c.caminho)).toContain('/parcelas?estado=atrasada');
  });

  it('mostra o serviço, filtra por ele e leva GMN para o perfil do cliente', async () => {
    const parcelaGmn = { ...parcela, id: 2, projeto_id: 6, projeto_titulo: 'Google Meu Negócio', servico: 'google_meu_negocio' };
    const { chamadas } = mockApi({
      'GET /parcelas': [parcela, parcelaGmn],
      'GET /parcelas?servico=google_meu_negocio': [parcelaGmn],
      [`GET /financeiro/mensal?ano=${ano}`]: meses,
    });
    renderizar(<Financeiro />);
    expect(await screen.findByRole('link', { name: 'Google Meu Negócio' })).toHaveAttribute('href', '/clientes/1?aba=gmn');
    expect(screen.getByRole('link', { name: 'Site Ana' })).toHaveAttribute('href', '/projetos/5');
    expect(screen.getByRole('cell', { name: 'GMN' })).toBeInTheDocument();
    await userEvent.setup().selectOptions(screen.getByLabelText('Serviço'), 'google_meu_negocio');
    expect(chamadas.some((c) => c.caminho === '/parcelas?servico=google_meu_negocio')).toBe(true);
  });
});

describe('Financeiro — vendas de placa', () => {
  it('mostra a venda como linha, com link para Placas › Vendas, sem colidir com parcela de mesmo id', async () => {
    const venda = {
      tipo: 'venda_placa', id: 1, projeto_titulo: 'Placa 10x10 × 1', cliente_nome: 'Rango do Bicho', descricao: 'Venda de placas',
      valor_centavos: 8000, vencimento: '2026-10-02', estado: 'atrasada', servico: 'placas_nfc', cliente_id: 7,
    };
    mockApi({
      'GET /parcelas': [{ ...parcela, tipo: 'parcela' }, venda],
      [`GET /financeiro/mensal?ano=${ano}`]: meses,
    });
    renderizar(<Financeiro />, { rota: '/financeiro', padrao: '/financeiro' });
    expect(await screen.findByRole('link', { name: 'Placa 10x10 × 1' })).toHaveAttribute('href', '/servicos?aba=placas&placas=vendas');
    expect(screen.getByRole('link', { name: 'Site Ana' })).toBeInTheDocument();
  });
});
