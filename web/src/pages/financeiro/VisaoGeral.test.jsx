import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VisaoGeral } from './VisaoGeral.jsx';
import { mockApi } from '../../test/mockApi.js';
import { renderizar } from '../../test/renderizar.jsx';
import { hojeISO } from '../../lib/datas.js';
import { mesesDoAno } from '../../lib/resumoFinanceiro.js';
import { definirValoresOcultos } from '../../lib/privacidade.js';

vi.mock('recharts', async () => (await import('../../test/mockRecharts.js')).rechartsFalso);

const hoje = hojeISO();
const ano = Number(hoje.slice(0, 4));
const janeiro = `${ano}-01`;
const corridos = (a) => mesesDoAno(a).filter((m) => m <= hoje.slice(0, 7));
const ferramentas = (a) => Object.fromEntries(corridos(a).map((m) => [
  `GET /ferramentas?mes=${m}`,
  { mes: m, ferramentas: m === janeiro ? [{ cobranca: 'creditos', criado_em: `${ano}-01-01`, gasto_mes_centavos: 10000 }] : [], total_mes_centavos: 0 },
]));
const parcelas = [
  { tipo: 'parcela', id: 1, cliente_nome: 'Ana', descricao: 'Entrada', valor_centavos: 100000, servico: 'site_sistema', mensalidade: 0, pago_em: `${janeiro}-15`, estado: 'paga', vencimento: `${janeiro}-10` },
  { tipo: 'parcela', id: 2, cliente_nome: 'Bia', descricao: 'Parcela 2/2', valor_centavos: 30000, servico: 'site_sistema', mensalidade: 0, pago_em: null, estado: 'atrasada', vencimento: `${janeiro}-20` },
];
const lotes = [{ id: 1, data_compra: `${janeiro}-05`, valor_kit_centavos: 15000, valor_frete_centavos: 5000 }];

// valor do cartão de resumo com esse rótulo
const cartao = (rotulo) => screen.getByText(rotulo, { selector: '.cartao-numero__rotulo' }).nextSibling;

afterEach(() => act(() => definirValoresOcultos(false)));

describe('Visão geral do Financeiro', () => {
  it('resume faturamento, custos, resultado e o que está em aberto no ano', async () => {
    mockApi({ 'GET /parcelas': parcelas, 'GET /placas/lotes': lotes, ...ferramentas(ano) });
    renderizar(<VisaoGeral />);
    expect(await screen.findByText('Faturamento x custos')).toBeInTheDocument();
    expect(cartao('Faturamento')).toHaveTextContent('1.000,00');
    expect(cartao('Custos')).toHaveTextContent('300,00');
    expect(cartao('Sobrou')).toHaveTextContent('700,00');
    expect(screen.getByText('70% do que entrou')).toBeInTheDocument();
    expect(cartao('A receber')).toHaveTextContent('300,00');
    expect(screen.getByText(/300,00 atrasado/)).toBeInTheDocument();

    const demonstrativo = screen.getByRole('table');
    expect(within(demonstrativo).getByRole('row', { name: /Total de receitas/ })).toHaveTextContent('1.000,00');
    expect(within(demonstrativo).getByRole('row', { name: /Material de placas/ })).toHaveTextContent('200,00');
    expect(within(demonstrativo).getByRole('row', { name: /Ferramentas e assinaturas/ })).toHaveTextContent('100,00');

    expect(within(screen.getByRole('list', { name: 'De onde vem' })).getByText('Sites e sistemas')).toBeInTheDocument();
    expect(screen.getByText('Bia')).toBeInTheDocument(); // atrasada aparece nos próximos 30 dias
  });

  it('troca de ano e não deixa ir para o futuro', async () => {
    const { chamadas } = mockApi({ 'GET /parcelas': [], 'GET /placas/lotes': [], ...ferramentas(ano), ...ferramentas(ano - 1) });
    renderizar(<VisaoGeral />);
    expect(await screen.findByText('Faturamento x custos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Próximo ano' })).toBeDisabled();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Ano anterior' }));
    expect(await screen.findByRole('heading', { name: `Demonstrativo ${ano - 1}` })).toBeInTheDocument();
    expect(chamadas.filter((c) => c.caminho.startsWith(`/ferramentas?mes=${ano - 1}-`))).toHaveLength(12);
    expect(screen.getByText(`Nenhuma entrada ou saída em ${ano - 1}.`)).toBeInTheDocument();
  });

  it('esconde os valores no modo ocultar', async () => {
    act(() => definirValoresOcultos(true));
    mockApi({ 'GET /parcelas': parcelas, 'GET /placas/lotes': lotes, ...ferramentas(ano) });
    renderizar(<VisaoGeral />);
    expect(await screen.findByText('Faturamento x custos')).toBeInTheDocument();
    expect(screen.queryByText(/1\.000,00/)).not.toBeInTheDocument();
    expect(cartao('Faturamento')).toHaveTextContent('R$ •••••');
  });
});
