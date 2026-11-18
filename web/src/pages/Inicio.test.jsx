import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Inicio } from './Inicio.jsx';
import { mockApi, resposta } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';
import { definirValoresOcultos } from '../lib/privacidade.js';

vi.mock('recharts', async () => (await import('../test/mockRecharts.js')).rechartsFalso);

afterEach(() => act(() => definirValoresOcultos(false)));

const PAINEL_VAZIO = {
  cartoes: {
    recebido_mes_centavos: 0, a_receber_mes_centavos: 0,
    atrasadas: { quantidade: 0, total_centavos: 0 }, em_andamento: 0, em_andamento_detalhe: { prototipo: 0, andamento: 0 },
    propostas: { quantidade: 0, total_centavos: 0 },
  },
  pede_atencao: [],
  tarefas_abertas: { total: 0, itens: [] },
  follow_ups: { orcamentos: [], projetos: [], aguardando: [] },
  tarefas_por_projeto: { reais: [], ficticios: [] },
  divulgacao: [],
  para_entregar: { gmn: 0, placas: 0, itens: [] },
};

const PAINEL = {
  ...PAINEL_VAZIO,
  cartoes: {
    recebido_mes_centavos: 123400, a_receber_mes_centavos: 300000,
    atrasadas: { quantidade: 2, total_centavos: 50000 }, em_andamento: 3, em_andamento_detalhe: { prototipo: 1, andamento: 2 },
    propostas: { quantidade: 1, total_centavos: 800000 },
  },
  tarefas_abertas: { total: 1, itens: [{ id: 5, texto: 'Ligar para Ana', prazo: null, etapa: 'a_fazer', projeto_titulo: null, cliente_nome: null, dias_atraso: 0, link: '/tarefas' }] },
};

const AVISOS = { 'GET /conteudos/avisos': { atrasados: [], falhas: [] }, 'GET /hospedagem/avisos': { fora_do_ar: [], cobrancas: [] } };
const GRAFICOS = {
  funil: { etapas: [{ etapa: 'ideia', quantidade: 4, percentual: 100 }], perdidos: 1 },
  origens: { total: 4, fatias: [{ nome: 'Instagram', quantidade: 4 }] },
};

const cartao = (rotulo) => screen.getByText(rotulo).closest('a');

describe('Inicio', () => {
  it('mostra Mission Control e os cinco números com links', async () => {
    mockApi({ ...AVISOS, 'GET /painel': PAINEL, 'GET /painel/graficos': GRAFICOS });
    renderizar(<Inicio />);
    expect(await screen.findByRole('heading', { name: 'Mission Control' })).toBeInTheDocument();
    expect(screen.getByText('Olá, Lucca')).toBeInTheDocument();
    expect(cartao('Recebido no mês')).toHaveAttribute('href', '/financeiro');
    expect(cartao('Recebido no mês')).toHaveTextContent('1.234,00');
    expect(cartao('A receber no mês')).toHaveAttribute('href', '/financeiro?aba=recebimentos');
    expect(cartao('Vencido')).toHaveAttribute('href', '/financeiro?aba=recebimentos');
    expect(cartao('Vencido')).toHaveTextContent('2 parcelas');
    expect(cartao('Projetos em andamento')).toHaveAttribute('href', '/servicos?aba=sites');
    expect(cartao('Projetos em andamento')).toHaveTextContent('1 em protótipo, 2 em versão final');
    expect(cartao('Propostas abertas')).toHaveAttribute('href', '/servicos?aba=sites');
    expect(cartao('Propostas abertas')).toHaveTextContent('8.000,00');
    expect(screen.getByText('Ligar para Ana')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Funil de oportunidades' })).toBeInTheDocument();
    expect(screen.queryByText(/cobranças? atrasadas?/)).not.toBeInTheDocument();
  });

  it('Pede ação vem antes do to-do e dos follow-ups', async () => {
    mockApi({ ...AVISOS, 'GET /painel': PAINEL, 'GET /painel/graficos': GRAFICOS });
    renderizar(<Inicio />);
    const pede = await screen.findByRole('heading', { name: 'Pede ação' });
    const antes = (a, b) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(antes(pede, screen.getByLabelText('Nova tarefa'))).toBeTruthy();
    expect(antes(pede, screen.getByRole('heading', { name: 'Follow-ups' }))).toBeTruthy();
  });

  it('Vencido fica em perigo quando há atrasadas', async () => {
    mockApi({ ...AVISOS, 'GET /painel': PAINEL, 'GET /painel/graficos': GRAFICOS });
    renderizar(<Inicio />);
    await screen.findByText('Vencido');
    expect(cartao('Vencido')).toHaveClass('cartao-numero--perigo');
    expect(cartao('A receber no mês')).not.toHaveClass('cartao-numero--perigo');
  });

  it('sem atrasadas o Vencido não fica em perigo', async () => {
    mockApi({ ...AVISOS, 'GET /painel': PAINEL_VAZIO, 'GET /painel/graficos': GRAFICOS });
    renderizar(<Inicio />);
    await screen.findByText('Vencido');
    expect(cartao('Vencido')).not.toHaveClass('cartao-numero--perigo');
    expect(cartao('Vencido')).toHaveTextContent('0 parcelas');
  });

  it('com ocultar valores ligado nenhum valor em reais aparece', async () => {
    act(() => definirValoresOcultos(true));
    mockApi({ ...AVISOS, 'GET /painel': PAINEL, 'GET /painel/graficos': GRAFICOS });
    renderizar(<Inicio />);
    await screen.findByText('Vencido');
    // a máscara "R$ •••••" é o único formato com R$ permitido
    expect(screen.queryByText(/R\$\s*\d/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\d,\d{2}/)).not.toBeInTheDocument();
    expect(cartao('Recebido no mês')).toHaveTextContent('R$ •••••');
  });

  it('concluir uma tarefa recarrega o painel', async () => {
    const { chamadas } = mockApi({ ...AVISOS, 'GET /painel': PAINEL, 'GET /painel/graficos': GRAFICOS, 'PUT /tarefas/5': { id: 5 } });
    renderizar(<Inicio />);
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Concluir: Ligar para Ana'));
    await vi.waitFor(() => expect(chamadas.filter((c) => c.metodo === 'GET' && c.caminho === '/painel')).toHaveLength(2));
  });

  it('CRM vazio abre sem quebrar', async () => {
    mockApi({ ...AVISOS, 'GET /painel': PAINEL_VAZIO, 'GET /painel/graficos': resposta(500, { erro: 'Falhou' }) });
    renderizar(<Inicio />);
    expect(await screen.findByText('Nenhuma tarefa aberta.')).toBeInTheDocument();
    expect(screen.getByText('Ninguém esperando por você.')).toBeInTheDocument();
    expect(screen.getByText('Tudo divulgado.')).toBeInTheDocument();
    expect(cartao('Propostas abertas')).toHaveTextContent('0');
  });
});
