import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { Inicio } from './Inicio.jsx';
import { mockApi, resposta } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';

vi.mock('recharts', async () => (await import('../test/mockRecharts.js')).rechartsFalso);

const PAINEL_VAZIO = {
  cartoes: { a_receber_mes_centavos: 0, atrasadas: { quantidade: 0, total_centavos: 0 }, em_andamento: 0, propostas: { quantidade: 0, total_centavos: 0 } },
  tarefas_por_projeto: { reais: [], ficticios: [] },
  divulgacao: [],
  para_entregar: { gmn: 0, placas: 0, itens: [] },
};

const GRAFICOS = {
  funil: {
    etapas: [
      { etapa: 'ideia', quantidade: 4, percentual: 100 },
      { etapa: 'valor_definido', quantidade: 2, percentual: 50 },
      { etapa: 'andamento', quantidade: 1, percentual: 25 },
      { etapa: 'entregue', quantidade: 1, percentual: 25 },
    ],
    perdidos: 1,
  },
  origens: { total: 4, fatias: [{ nome: 'Instagram', quantidade: 3 }, { nome: 'Não informado', quantidade: 1 }] },
};

const GRAFICOS_VAZIOS = {
  funil: { etapas: GRAFICOS.funil.etapas.map((e) => ({ ...e, quantidade: 0, percentual: 0 })), perdidos: 0 },
  origens: { total: 0, fatias: [] },
};

describe('Inicio', () => {
  it('mostra os cartões, as entregas com prazo e a divulgação à parte', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-23T12:00:00'));
    try {
      mockApi({ 'GET /conteudos/avisos': { atrasados: [], falhas: [] }, 'GET /hospedagem/avisos': { fora_do_ar: [], cobrancas: [] },
        'GET /painel': {
          ...PAINEL_VAZIO,
          cartoes: {
            a_receber_mes_centavos: 300000,
            atrasadas: { quantidade: 1, total_centavos: 50000 },
            em_andamento: 2,
            propostas: { quantidade: 1, total_centavos: 800000 },
          },
          tarefas_por_projeto: {
            reais: [{ projeto_id: 10, projeto_titulo: 'Site A', tarefas: [
              { id: 1, texto: 'Revisar', prazo: null },
              { id: 2, texto: 'Mandar layout', prazo: '2026-09-30' },
              { id: 3, texto: 'Cobrar conteúdo', prazo: '2026-09-20' },
            ] }],
            ficticios: [{ projeto_id: 20, projeto_titulo: 'Case em obra', tarefas: [{ id: 4, texto: 'Ajustar', prazo: null }] }],
          },
          divulgacao: [
            { projeto_id: 30, projeto_titulo: 'Loja real', ficticio: false, falta: ['portfolio'] },
            { projeto_id: 40, projeto_titulo: 'Case pronto', ficticio: true, falta: ['instagram', 'portfolio'] },
          ],
        },
      });
      renderizar(<Inicio />);
      expect(await screen.findByText('1 cobrança atrasada.')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Ver no Financeiro' })).toHaveAttribute('href', '/financeiro?aba=recebimentos');
      // dinheiro mora no Financeiro: nenhum valor em R$ na Início
      expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
      expect(screen.queryByText('A receber este mês')).not.toBeInTheDocument();

      const entregas = within(screen.getByRole('heading', { name: 'Entregas a clientes' }).closest('section'));
      expect(entregas.getByRole('link', { name: 'Site A' })).toHaveAttribute('href', '/projetos/10');
      expect(entregas.getByText('Revisar')).toBeInTheDocument();
      expect(entregas.getByText('30/09/2026')).toBeInTheDocument();
      expect(entregas.getByText('20/09/2026 · atrasada')).toHaveClass('item-atrasado');
      expect(entregas.queryByText('Publicar no portfólio')).not.toBeInTheDocument();

      const divulgacao = within(screen.getByRole('heading', { name: 'Divulgação e portfólio' }).closest('section'));
      expect(divulgacao.getByRole('link', { name: 'Loja real' })).toHaveAttribute('href', '/projetos/30');
      expect(divulgacao.getAllByText('Portfólio')).toHaveLength(2);
      expect(divulgacao.getAllByText('Instagram')).toHaveLength(1);
      expect(divulgacao.getAllByText('fictício')).toHaveLength(1);
      expect(divulgacao.getByRole('link', { name: 'Case em obra' })).toHaveAttribute('href', '/projetos/20');
      expect(divulgacao.getByText('Ajustar')).toBeInTheDocument();

      expect(screen.queryByText(/Próximos 7 dias/)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('mostra mensagens quando não há nada pendente', async () => {
    mockApi({ 'GET /conteudos/avisos': { atrasados: [], falhas: [] }, 'GET /hospedagem/avisos': { fora_do_ar: [], cobrancas: [] }, 'GET /painel': PAINEL_VAZIO });
    renderizar(<Inicio />);
    expect(await screen.findByText('Nenhum GMN pendente.')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma placa pendente.')).toBeInTheDocument();
    expect(screen.getByText('Tudo divulgado.')).toBeInTheDocument();
    expect(screen.getAllByText('Nenhuma tarefa pendente.')).toHaveLength(2);
  });

  it('mostra GMN e placas a entregar em grupos separados', async () => {
    mockApi({ 'GET /conteudos/avisos': { atrasados: [], falhas: [] }, 'GET /hospedagem/avisos': { fora_do_ar: [], cobrancas: [] },
      'GET /painel': {
        ...PAINEL_VAZIO,
        para_entregar: {
          gmn: 1, placas: 1,
          itens: [
            { projeto_id: 6, cliente_id: 1, cliente_nome: 'Ana', servico: 'google_meu_negocio' },
            { projeto_id: 8, cliente_id: 2, cliente_nome: 'Bruno', servico: 'placas_nfc' },
          ],
        },
      },
    });
    renderizar(<Inicio />);
    expect(await screen.findByRole('link', { name: 'Ana' })).toHaveAttribute('href', '/clientes/1?aba=gmn');
    expect(screen.getByRole('link', { name: 'Bruno' })).toHaveAttribute('href', '/clientes/2?aba=placas');
    expect(screen.getByRole('heading', { name: 'Google Meu Negócio' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Placas NFC' })).toBeInTheDocument();
    expect(screen.queryByText('Nenhuma placa pendente.')).not.toBeInTheDocument();
    expect(screen.queryByText(/a receber/)).not.toBeInTheDocument();
  });

  it('mostra o funil e a origem dos clientes; gráficos de dinheiro ficam no Financeiro', async () => {
    mockApi({ 'GET /conteudos/avisos': { atrasados: [], falhas: [] }, 'GET /hospedagem/avisos': { fora_do_ar: [], cobrancas: [] }, 'GET /painel': PAINEL_VAZIO, 'GET /painel/graficos': GRAFICOS });
    renderizar(<Inicio />);
    expect(await screen.findByRole('heading', { name: 'Funil de oportunidades' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'De onde vêm os clientes' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Faturamento por serviço' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Recebido por mês' })).not.toBeInTheDocument();
    expect(screen.getByText('1 perdido')).toBeInTheDocument();
    expect(await screen.findByText('Instagram')).toBeInTheDocument(); // rosca é carregada sob demanda
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.queryByText('Ainda sem dados')).not.toBeInTheDocument();
  });

  it('com tudo zerado mostra "Ainda sem dados" nos 2 gráficos', async () => {
    mockApi({ 'GET /conteudos/avisos': { atrasados: [], falhas: [] }, 'GET /hospedagem/avisos': { fora_do_ar: [], cobrancas: [] }, 'GET /painel': PAINEL_VAZIO, 'GET /painel/graficos': GRAFICOS_VAZIOS });
    renderizar(<Inicio />);
    expect(await screen.findAllByText('Ainda sem dados')).toHaveLength(2);
  });

  it('erro nos gráficos não esconde o resto da Início', async () => {
    mockApi({ 'GET /conteudos/avisos': { atrasados: [], falhas: [] }, 'GET /hospedagem/avisos': { fora_do_ar: [], cobrancas: [] }, 'GET /painel': PAINEL_VAZIO, 'GET /painel/graficos': resposta(500, { erro: 'Falhou' }) });
    renderizar(<Inicio />);
    expect(await screen.findByText('Tudo divulgado.')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getAllByText('Nenhuma tarefa pendente.')).toHaveLength(2);
    expect(screen.queryByRole('heading', { name: 'Funil de oportunidades' })).not.toBeInTheDocument();
  });
});
