import { describe, it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PainelReceber } from './PainelReceber.jsx';
import { mockApi } from '../../test/mockApi.js';
import { renderizar } from '../../test/renderizar.jsx';
import { hojeISO } from '../../lib/datas.js';

const mes = hojeISO().slice(0, 7);

const projetos = [
  { id: 1, servico: 'site_sistema', etapa: 'andamento', cliente_id: 5, cliente_nome: 'Popy', titulo: 'Site Popy' },
  { id: 2, servico: 'site_sistema', etapa: 'entregue', data_entrega: `${mes}-01`, cliente_id: 6, cliente_nome: 'Dri', titulo: 'Loja Dri' },
  { id: 3, servico: 'site_sistema', etapa: 'entregue', data_entrega: '2020-01-01', cliente_id: 6, cliente_nome: 'Dri', titulo: 'Antigo' },
];

const parcelas = [
  { tipo: 'parcela', id: 10, projeto_id: 1, projeto_titulo: 'Site Popy', cliente_id: 5, cliente_nome: 'Popy', servico: 'site_sistema', descricao: 'Parcela 1/2', vencimento: '2020-01-10', valor_centavos: 60000, estado: 'atrasada', pago_em: null },
  { tipo: 'parcela', id: 11, projeto_id: 2, projeto_titulo: 'Loja Dri', cliente_id: 6, cliente_nome: 'Dri', servico: 'site_sistema', descricao: 'Parcela 2/3', vencimento: '2999-01-10', valor_centavos: 40000, estado: 'pendente', pago_em: null },
  { tipo: 'parcela', id: 12, projeto_id: 2, projeto_titulo: 'Loja Dri', cliente_id: 6, cliente_nome: 'Dri', servico: 'site_sistema', descricao: 'Parcela 1/3', vencimento: '2020-01-01', valor_centavos: 40000, estado: 'paga', pago_em: '2020-01-01' },
];

describe('PainelReceber — Sites e Sistemas', () => {
  it('mostra números e a lista do que falta receber, mais antiga primeiro', async () => {
    mockApi({ 'GET /projetos?servico=site_sistema': projetos, 'GET /parcelas?servico=site_sistema': parcelas });
    renderizar(<PainelReceber servico="site_sistema" />);
    expect(await screen.findByText('R$ 1.000,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 1.000,00').closest('.faixa-numeros')).not.toBeNull();
    expect(screen.getByText('Em andamento').nextSibling).toHaveTextContent('1');
    expect(screen.getByText('Entregues no mês').nextSibling).toHaveTextContent('1');
    const lista = screen.getByRole('region', { name: 'A receber' });
    const linhas = within(lista).getAllByRole('row').slice(1);
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toHaveTextContent('Popy');
    expect(within(linhas[0]).getByText('Atrasada')).toBeInTheDocument();
  });

  it('"Recebi" marca a parcela como paga hoje', async () => {
    const { chamadas } = mockApi({
      'GET /projetos?servico=site_sistema': projetos,
      'GET /parcelas?servico=site_sistema': parcelas,
      'PUT /parcelas/10': { ...parcelas[0], pago_em: hojeISO(), estado: 'paga' },
    });
    renderizar(<PainelReceber servico="site_sistema" />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Recebi de Popy — Parcela 1/2' }));
    await waitFor(() => expect(chamadas.find((c) => c.metodo === 'PUT')).toMatchObject({ caminho: '/parcelas/10', corpo: { pago_em: hojeISO() } }));
  });
});

describe('PainelReceber — Google Meu Negócio', () => {
  it('conta pendentes e configurados no mês', async () => {
    mockApi({
      'GET /projetos?servico=google_meu_negocio': [
        { id: 4, servico: 'google_meu_negocio', etapa: 'andamento', cliente_id: 5, cliente_nome: 'Popy' },
        { id: 5, servico: 'google_meu_negocio', etapa: 'entregue', data_entrega: `${mes}-02`, cliente_id: 6, cliente_nome: 'Dri' },
      ],
      'GET /parcelas?servico=google_meu_negocio': [],
    });
    renderizar(<PainelReceber servico="google_meu_negocio" />);
    expect(await screen.findByText('Pendentes')).toBeInTheDocument();
    expect(screen.getByText('Pendentes').nextSibling).toHaveTextContent('1');
    expect(screen.getByText('Configurados no mês').nextSibling).toHaveTextContent('1');
    expect(screen.getByText('A receber').nextSibling).toHaveTextContent('Tudo recebido');
    expect(screen.queryByRole('region', { name: 'A receber' })).toBeNull();
  });
});
