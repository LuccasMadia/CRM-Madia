import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { Inicio } from './Inicio.jsx';
import { mockApi, resposta } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';

vi.mock('recharts', async () => (await import('../test/mockRecharts.js')).rechartsFalso);

const PAINEL_VAZIO = {
  cartoes: { a_receber_mes_centavos: 0, atrasadas: { quantidade: 0, total_centavos: 0 }, em_andamento: 0, propostas: { quantidade: 0, total_centavos: 0 } },
  tarefas_por_projeto: { reais: [], ficticios: [] },
  proximos: [],
  para_entregar: { gmn: 0, placas: 0, itens: [] },
};

const GRAFICOS = {
  funil: {
    etapas: [
      { etapa: 'contato', quantidade: 4, percentual: 100 },
      { etapa: 'proposta', quantidade: 2, percentual: 50 },
      { etapa: 'andamento', quantidade: 1, percentual: 25 },
      { etapa: 'entregue', quantidade: 1, percentual: 25 },
    ],
    perdidos: 1,
  },
  recebido_por_mes: ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].map((mes, i) => ({ mes, total_centavos: i * 1000 })),
  origens: { total: 4, fatias: [{ nome: 'Instagram', quantidade: 3 }, { nome: 'Não informado', quantidade: 1 }] },
  por_servico: [
    { servico: 'site_sistema', total_centavos: 150000 },
    { servico: 'google_meu_negocio', total_centavos: 20000 },
    { servico: 'placas_nfc', total_centavos: 0 },
  ],
};

const GRAFICOS_VAZIOS = {
  funil: { etapas: GRAFICOS.funil.etapas.map((e) => ({ ...e, quantidade: 0, percentual: 0 })), perdidos: 0 },
  recebido_por_mes: GRAFICOS.recebido_por_mes.map((m) => ({ ...m, total_centavos: 0 })),
  origens: { total: 0, fatias: [] },
  por_servico: GRAFICOS.por_servico.map((s) => ({ ...s, total_centavos: 0 })),
};

describe('Inicio', () => {
  it('mostra cartões e próximos itens, destacando atrasados', async () => {
    mockApi({
      'GET /painel': {
        cartoes: {
          a_receber_mes_centavos: 300000,
          atrasadas: { quantidade: 1, total_centavos: 50000 },
          em_andamento: 2,
          propostas: { quantidade: 1, total_centavos: 800000 },
        },
        tarefas_por_projeto: {
          reais: [{ projeto_id: 10, projeto_titulo: 'Site A', tarefas: [
            { id: 1, texto: 'Revisar', prazo: null },
            { id: 'divulgacao-10-Publicar no portfólio', texto: 'Publicar no portfólio', prazo: null },
          ] }],
          ficticios: [{ projeto_id: 20, projeto_titulo: 'Case fictício', tarefas: [{ id: 2, texto: 'Ajustar', prazo: '2026-09-30' }] }],
        },
        proximos: [
          { tipo: 'parcela', id: 3, projeto_id: 5, titulo: 'Entrada', contexto: 'Site Ana', data: '2026-09-20', atrasado: true, valor_centavos: 50000 },
          { tipo: 'conteudo', id: 4, projeto_id: null, titulo: 'Post case', contexto: 'instagram', data: '2026-09-25', atrasado: false },
        ],
      },
    });
    renderizar(<Inicio />);
    expect(await screen.findByText(/3\.000,00/)).toBeInTheDocument();
    expect(screen.getByText(/1 · R\$\s500,00/)).toBeInTheDocument(); // \s cobre o espaço não separável do Intl
    expect(screen.getByRole('link', { name: 'Entrada' })).toHaveAttribute('href', '/projetos/5');
    expect(screen.getByRole('link', { name: 'Post case' })).toHaveAttribute('href', '/conteudo');
    expect(screen.getByText('atrasado')).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Site A' })).toHaveAttribute('href', '/projetos/10');
    expect(screen.getByText('Revisar')).toBeInTheDocument();
    expect(screen.getByText('Publicar no portfólio')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Case fictício' })).toHaveAttribute('href', '/projetos/20');
    expect(screen.getByText('Ajustar')).toBeInTheDocument();

    expect(screen.queryByText(/Divulgação pendente/)).not.toBeInTheDocument();
  });

  it('mostra mensagem quando não há nada nos próximos dias nem tarefas', async () => {
    mockApi({
      'GET /painel': {
        cartoes: { a_receber_mes_centavos: 0, atrasadas: { quantidade: 0, total_centavos: 0 }, em_andamento: 0, propostas: { quantidade: 0, total_centavos: 0 } },
        tarefas_por_projeto: { reais: [], ficticios: [] },
        proximos: [],
      },
    });
    renderizar(<Inicio />);
    expect(await screen.findByText('Nada para os próximos 7 dias.')).toBeInTheDocument();
    expect(screen.getAllByText('Nenhuma tarefa pendente.')).toHaveLength(2);
  });

  it('mostra o que falta entregar e leva parcela de GMN ao perfil', async () => {
    mockApi({
      'GET /painel': {
        cartoes: { a_receber_mes_centavos: 0, atrasadas: { quantidade: 0, total_centavos: 0 }, em_andamento: 0, propostas: { quantidade: 0, total_centavos: 0 } },
        tarefas_por_projeto: { reais: [], ficticios: [] },
        proximos: [{ tipo: 'parcela', id: 3, projeto_id: 6, titulo: 'Pagamento', contexto: 'Google Meu Negócio', data: '2026-09-25', atrasado: false, valor_centavos: 20000, servico: 'google_meu_negocio', cliente_id: 1 }],
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
    expect(await screen.findByText('1 GMN pendente · 1 venda de placas a entregar')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ana — Google Meu Negócio' })).toHaveAttribute('href', '/clientes/1?aba=gmn');
    expect(screen.getByRole('link', { name: 'Bruno — Placas NFC' })).toHaveAttribute('href', '/clientes/2?aba=placas');
    expect(screen.getByRole('link', { name: 'Pagamento' })).toHaveAttribute('href', '/clientes/1?aba=gmn');
  });

  it('mostra os 4 gráficos com os dados do painel', async () => {
    mockApi({ 'GET /painel': PAINEL_VAZIO, 'GET /painel/graficos': GRAFICOS });
    renderizar(<Inicio />);
    expect(await screen.findByRole('heading', { name: 'Funil de oportunidades' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Faturamento por serviço' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'De onde vêm os clientes' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Recebido por mês' })).toBeInTheDocument();
    expect(screen.getByText('1 perdido')).toBeInTheDocument();
    expect(await screen.findByText('Instagram')).toBeInTheDocument(); // rosca é carregada sob demanda
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.queryByText('Ainda sem dados')).not.toBeInTheDocument();
  });

  it('com tudo zerado mostra "Ainda sem dados" nos 4 gráficos', async () => {
    mockApi({ 'GET /painel': PAINEL_VAZIO, 'GET /painel/graficos': GRAFICOS_VAZIOS });
    renderizar(<Inicio />);
    expect(await screen.findAllByText('Ainda sem dados')).toHaveLength(4);
  });

  it('erro nos gráficos não esconde o resto da Início', async () => {
    mockApi({ 'GET /painel': PAINEL_VAZIO, 'GET /painel/graficos': resposta(500, { erro: 'Falhou' }) });
    renderizar(<Inicio />);
    expect(await screen.findByText('Nada para os próximos 7 dias.')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getAllByText('Nenhuma tarefa pendente.')).toHaveLength(2);
    expect(screen.queryByRole('heading', { name: 'Funil de oportunidades' })).not.toBeInTheDocument();
  });
});
