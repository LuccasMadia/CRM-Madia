import { describe, it, expect, afterEach } from 'vitest';
import { screen, within, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Mensalidades } from './Mensalidades.jsx';
import { Notificacoes } from '../../components/Notificacoes.jsx';
import { mockApi } from '../../test/mockApi.js';
import { renderizar } from '../../test/renderizar.jsx';
import { definirValoresOcultos } from '../../lib/privacidade.js';

const base = {
  servico: 'site_sistema', etapa: 'entregue', mensalidade_ativa: 1, mensalidade_dia_vencimento: 5,
  mensalidade_inicio_modo: 'entrega', mensalidade_inicio_data: null, data_inicio: null, data_entrega: '2026-08-05',
  atrasadas: 0, atrasado_centavos: 0, atrasada_desde: null, proxima: null, em_aberto: null, ultima_paga: null,
  hospedagem: { tipo: 'vercel', status: 'no_ar', url: 'https://x.vercel.app' },
};
const ITENS = [
  {
    ...base, projeto_id: 1, cliente_id: 10, cliente_nome: 'Bar do Zé', titulo: 'Site do bar', tipo: 'site', mensalidade_valor_centavos: 15000,
    situacao: 'atrasada', atrasadas: 1, atrasado_centavos: 15000, atrasada_desde: '2026-10-05',
    em_aberto: { id: 77, vencimento: '2026-10-05', valor_centavos: 15000 },
  },
  {
    ...base, projeto_id: 2, cliente_id: 11, cliente_nome: 'Filinto', titulo: 'Filinto', tipo: 'site', mensalidade_valor_centavos: 10000,
    etapa: 'prototipo', data_entrega: null, situacao: 'aguardando',
  },
  {
    ...base, projeto_id: 3, cliente_id: 12, cliente_nome: 'Loja', titulo: 'GMN', tipo: 'gmn', servico: 'google_meu_negocio', hospedagem: null,
    mensalidade_valor_centavos: 5000, mensalidade_inicio_modo: 'data', mensalidade_inicio_data: '2026-09-05', situacao: 'em_dia',
    proxima: { id: 88, vencimento: '2026-11-05', valor_centavos: 5000 }, ultima_paga: { vencimento: '2026-10-05', pago_em: '2026-10-04' },
  },
];
const RESUMO = { por_mes_centavos: 20000, cobrando: 2, a_comecar_centavos: 10000, a_comecar: 1, atrasado_centavos: 15000, atrasadas: 1 };
const rotasBase = (extra = {}) => ({
  'GET /financeiro/mensalidades': { resumo: RESUMO, itens: ITENS },
  'GET /hospedagem/avisos': { fora_do_ar: [], cobrancas: [] },
  'GET /vercel/estado': { conectado: true, prazo_dias: 7 },
  ...extra,
});
const cartao = (rotulo) => screen.getByText(rotulo, { selector: '.cartao-numero__rotulo' }).nextSibling;
const grupo = (nome) => screen.getByRole('heading', { name: nome }).closest('section');

afterEach(() => act(() => definirValoresOcultos(false)));

describe('Mensalidades', () => {
  it('mostra o resumo e separa por tipo, com a situação de cada cliente', async () => {
    mockApi(rotasBase());
    renderizar(<><Mensalidades /><Notificacoes /></>);
    expect(await screen.findByRole('heading', { name: 'Sites' })).toBeInTheDocument();
    expect(cartao('Entra por mês')).toHaveTextContent('200,00');
    expect(cartao('Atrasado')).toHaveTextContent('150,00');
    const sites = within(grupo('Sites'));
    expect(sites.getByRole('link', { name: 'Bar do Zé' })).toHaveAttribute('href', '/projetos/1');
    expect(sites.getByText(/150,00 desde 05\/10\/2026/)).toBeInTheDocument();
    expect(sites.getByText('Começa quando o projeto for entregue')).toBeInTheDocument();
    expect(sites.getAllByText('No ar')).toHaveLength(2);
    const gmn = within(grupo('Google Meu Negócio'));
    expect(gmn.getByRole('link', { name: 'Loja' })).toHaveAttribute('href', '/clientes/12?aba=gmn');
    expect(gmn.getByText('05/11/2026')).toBeInTheDocument();
    expect(gmn.queryByText('No ar')).toBeNull();
    expect(screen.getByText('Ninguém paga mensalidade de sistema, SaaS ainda.')).toBeInTheDocument();
  });

  it('Marcar paga quita a mais antiga em aberto e recarrega', async () => {
    const { chamadas } = mockApi(rotasBase({ 'PUT /parcelas/77': {} }));
    renderizar(<><Mensalidades /><Notificacoes /></>);
    const botao = await screen.findByRole('button', { name: /Marcar paga a mensalidade de Bar do Zé de 05\/10\/2026/ });
    await userEvent.setup().click(botao);
    expect(await screen.findByText('Mensalidade de 05/10/2026 marcada como paga')).toBeInTheDocument();
    expect(chamadas.find((c) => c.metodo === 'PUT')).toMatchObject({ caminho: '/parcelas/77', corpo: { pago_em: expect.any(String) } });
    expect(chamadas.filter((c) => c.caminho === '/financeiro/mensalidades')).toHaveLength(2);
  });

  it('Editar grava no cadastro do projeto, só os campos da mensalidade', async () => {
    const { chamadas } = mockApi(rotasBase({ 'PUT /projetos/1': {} }));
    renderizar(<><Mensalidades /><Notificacoes /></>);
    const usuario = userEvent.setup();
    await usuario.click(await screen.findByRole('button', { name: 'Editar mensalidade de Bar do Zé' }));
    const dialogo = within(screen.getByRole('dialog', { name: 'Mensalidade · Bar do Zé' }));
    const valor = dialogo.getByLabelText('Valor da mensalidade (R$)');
    await usuario.clear(valor);
    await usuario.type(valor, '180,00');
    await usuario.click(dialogo.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Mensalidade salva')).toBeInTheDocument();
    expect(chamadas.find((c) => c.metodo === 'PUT').corpo).toEqual({
      mensalidade_ativa: true, mensalidade_valor_centavos: 18000, mensalidade_dia_vencimento: 5,
      apagar_mensalidades_abertas: false, mensalidade_inicio_modo: 'entrega', mensalidade_inicio_data: null,
    });
  });

  it('desligar oferece apagar as que não venceram; GMN não mostra "Começa a cobrar"', async () => {
    const { chamadas } = mockApi(rotasBase({ 'PUT /projetos/3': {} }));
    renderizar(<><Mensalidades /><Notificacoes /></>);
    const usuario = userEvent.setup();
    await usuario.click(await screen.findByRole('button', { name: 'Editar mensalidade de Loja' }));
    const dialogo = within(screen.getByRole('dialog'));
    expect(dialogo.queryByText('Começa a cobrar')).toBeNull();
    await usuario.click(dialogo.getByLabelText('Cobra mensalidade'));
    await usuario.click(dialogo.getByLabelText(/Apagar as mensalidades em aberto que ainda não venceram/));
    await usuario.click(dialogo.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(chamadas.some((c) => c.metodo === 'PUT')).toBe(true));
    expect(chamadas.find((c) => c.metodo === 'PUT').corpo).toMatchObject({ mensalidade_ativa: false, apagar_mensalidades_abertas: true });
    expect(chamadas.find((c) => c.metodo === 'PUT').corpo).not.toHaveProperty('mensalidade_inicio_modo');
  });

  it('esconde os valores no modo ocultar', async () => {
    act(() => definirValoresOcultos(true));
    mockApi(rotasBase());
    renderizar(<><Mensalidades /><Notificacoes /></>);
    await screen.findByRole('heading', { name: 'Sites' });
    expect(cartao('Entra por mês')).toHaveTextContent('R$ •••••');
    expect(screen.queryByText(/150,00/)).toBeNull();
  });
});
