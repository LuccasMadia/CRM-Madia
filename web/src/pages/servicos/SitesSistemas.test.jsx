import { describe, it, expect, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SitesSistemas } from './SitesSistemas.jsx';
import { mockApi as mockApiBase } from '../../test/mockApi.js';
import { renderizar } from '../../test/renderizar.jsx';
import { hojeISO } from '../../lib/datas.js';

const somar = (iso, dias) => new Date(Date.parse(`${iso}T00:00:00Z`) + dias * 86400000).toISOString().slice(0, 10);

const naoEntregue = {
  id: 1, cliente_id: 10, titulo: 'Site Ana', cliente_nome: 'Ana', etapa: 'andamento',
  valor_total_centavos: 250000, atualizado_em: '2026-09-01T10:00:00.000Z', postou_instagram: 0,
};
const entregue = {
  id: 2, cliente_id: 11, titulo: 'Loja Bruno', cliente_nome: 'Bruno', etapa: 'entregue', data_entrega: '2026-09-20',
  valor_total_centavos: 500000, atualizado_em: '2026-09-20T10:00:00.000Z', postou_instagram: 1, no_portfolio: 1,
};
const entregueAntes = {
  id: 4, cliente_id: 12, titulo: 'Cardápio Carla', cliente_nome: 'Carla', etapa: 'entregue', data_entrega: '2026-08-01',
  valor_total_centavos: 0, atualizado_em: '2026-10-10T10:00:00.000Z',
};
const perdido = {
  id: 3, cliente_id: 12, titulo: 'App Carla', cliente_nome: 'Carla', etapa: 'perdido',
  valor_total_centavos: 0, atualizado_em: '2026-09-10T10:00:00.000Z',
};

// A faixa "Pede atenção" carrega estas quatro fontes em qualquer visão.
const mockApi = (rotas) => mockApiBase({
  'GET /projetos?servico=site_sistema&ficticio=0': [],
  'GET /parcelas?servico=site_sistema': [],
  'GET /hospedagem/status': [],
  'GET /financeiro/mensalidades': { resumo: {}, itens: [] },
  'GET /clientes': [],
  ...rotas,
});

const abrir = (rota = '/servicos') => renderizar(<SitesSistemas />, { rota, padrao: '/servicos' });
const abrirNoAr = () => abrir('/servicos?aba=sites&ver=no_ar');

describe('SitesSistemas', () => {
  beforeEach(() => localStorage.clear());

  it('abre em "Em andamento" (quadro sem Entregue e Perdido) e lembra a visão No ar', async () => {
    mockApi({ 'GET /projetos?servico=site_sistema': [entregue] });
    const { unmount } = abrir();
    const visao = screen.getByRole('group', { name: 'Visão' });
    expect(within(visao).getByRole('button', { name: 'Em andamento' })).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByRole('region', { name: 'Versão final' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Entregue' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Perdido' })).toBeNull();
    await userEvent.setup().click(within(visao).getByRole('button', { name: 'No ar' }));
    expect(await screen.findByRole('row', { name: /Loja Bruno/ })).toBeInTheDocument();
    expect(localStorage.getItem('crm.sitesVisao')).toBe('no_ar');
    unmount();
    abrir();
    expect(await screen.findByRole('row', { name: /Loja Bruno/ })).toBeInTheDocument();
  });

  it('visões antigas continuam valendo: lista vira No ar, funil vira Em andamento', async () => {
    mockApi({ 'GET /projetos?servico=site_sistema': [entregue] });
    localStorage.setItem('crm.sitesVisao', 'lista');
    const { unmount } = abrir();
    expect(await screen.findByRole('row', { name: /Loja Bruno/ })).toBeInTheDocument();
    unmount();
    abrir('/servicos?aba=sites&ver=funil');
    expect(await screen.findByRole('region', { name: 'Ideia' })).toBeInTheDocument();
  });

  it('+ Oportunidade fica nas duas visões', async () => {
    mockApi({ 'GET /projetos?servico=site_sistema': [], 'GET /categorias': [], 'GET /nichos': [] });
    abrirNoAr();
    await userEvent.setup().click(screen.getByRole('button', { name: '+ Oportunidade' }));
    expect(await screen.findByRole('dialog', { name: 'Nova oportunidade' })).toBeInTheDocument();
  });

  it('sem pílulas de etapa: perdidos e fictícios ficam no seletor "Mostrar"', async () => {
    mockApi({ 'GET /projetos?servico=site_sistema&ficticio=0': [naoEntregue, perdido] });
    abrir();
    await screen.findByRole('region', { name: 'Versão final' });
    expect(screen.queryByRole('group', { name: 'Etapa' })).toBeNull();
    expect(screen.queryByText('App Carla')).toBeNull();
    const mostrar = screen.getByLabelText('Mostrar');
    expect(within(mostrar).getAllByRole('option').map((o) => o.textContent)).toEqual(['Reais', 'Fictícios', 'Perdidos']);
    await userEvent.setup().selectOptions(mostrar, 'perdidos');
    expect(await screen.findByRole('link', { name: 'App Carla' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Site Ana' })).toBeNull();
    // dá para reabrir um perdido pelo menu do card
    const mover = screen.getByLabelText('Mover App Carla');
    expect(within(mover).getAllByRole('option').map((o) => o.textContent)).toContain('Ideia');
  });

  it('No ar: entregues e versão final publicada, mais recentes primeiro, sem perdidos nem protótipos', async () => {
    const prototipo = { ...naoEntregue, id: 8, titulo: 'Proto Gil', etapa: 'prototipo' };
    mockApi({
      'GET /projetos?servico=site_sistema': [naoEntregue, entregueAntes, entregue, perdido, prototipo],
      'GET /hospedagem/status': [
        { projeto_id: 1, tipo: 'vercel', status: 'no_ar', status_desde: null },
        { projeto_id: 8, tipo: 'vercel', status: 'no_ar', status_desde: null },
      ],
    });
    abrirNoAr();
    const linhas = await screen.findAllByRole('row');
    expect(linhas).toHaveLength(4);
    expect(within(linhas[1]).getByRole('link', { name: 'Site Ana' })).toHaveAttribute('href', '/projetos/1');
    expect(within(linhas[1]).getByText('Ainda em versão final')).toBeInTheDocument();
    expect(within(linhas[2]).getByRole('link', { name: 'Loja Bruno' })).toBeInTheDocument();
    expect(within(linhas[3]).getByRole('link', { name: 'Cardápio Carla' })).toBeInTheDocument();
    expect(within(linhas[2]).getByRole('img', { name: 'Postou no Instagram' })).toBeInTheDocument();
    expect(within(linhas[2]).getByRole('img', { name: 'No portfólio' })).toBeInTheDocument();
    expect(within(linhas[3]).queryByRole('img', { name: 'No portfólio' })).toBeNull();
    expect(screen.queryByText('App Carla')).toBeNull();
    expect(screen.queryByText('Proto Gil')).toBeNull();
    expect(screen.getByRole('link', { name: 'Bruno' })).toHaveAttribute('href', '/clientes/11');
    expect(within(linhas[2]).getByText(/5\.000,00/)).toBeInTheDocument();
  });

  it('No ar: hospedagem com bolinha e mensalidade em dia ou atrasada', async () => {
    mockApi({
      'GET /projetos?servico=site_sistema': [entregue, entregueAntes],
      'GET /hospedagem/status': [
        { projeto_id: 2, tipo: 'vercel', status: 'fora_do_ar', status_desde: '2026-10-19T17:00:00.000Z' },
        { projeto_id: 4, tipo: 'sem_hospedagem', status: 'desconhecido', status_desde: null },
      ],
      'GET /financeiro/mensalidades': {
        resumo: {},
        itens: [{ projeto_id: 2, servico: 'site_sistema', situacao: 'atrasada', mensalidade_valor_centavos: 5000 }],
      },
    });
    abrirNoAr();
    const linhas = await screen.findAllByRole('row');
    await within(linhas[1]).findByRole('img', { name: 'Fora do ar' });
    expect(within(linhas[1]).getByText(/^Fora do ar desde \d{2}\/\d{2} \d{2}:\d{2}$/)).toBeInTheDocument();
    expect(await within(linhas[1]).findByText('Atrasada')).toHaveClass('etiqueta--atrasada');
    expect(within(linhas[1]).getByText(/50,00\/mês/)).toBeInTheDocument();
    expect(within(linhas[2]).getByText('Fica com o cliente')).toBeInTheDocument();
    expect(within(linhas[2]).queryByText('Atrasada')).toBeNull();
  });

  it('No ar: filtra por cliente e por Instagram', async () => {
    const { chamadas } = mockApi({
      'GET /projetos?servico=site_sistema': [entregue, entregueAntes],
      'GET /projetos?servico=site_sistema&cliente_id=11': [entregue],
      'GET /projetos?servico=site_sistema&cliente_id=11&postou_instagram=1': [entregue],
      'GET /clientes': [{ id: 11, nome: 'Bruno' }],
    });
    abrirNoAr();
    await screen.findByText('Cardápio Carla');
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Cliente'), '11');
    await user.selectOptions(screen.getByLabelText('Instagram'), '1');
    expect(chamadas.map((c) => c.caminho)).toContain('/projetos?servico=site_sistema&cliente_id=11&postou_instagram=1');
    expect(screen.queryByText('Cardápio Carla')).toBeNull();
  });

  it('No ar: estado vazio', async () => {
    mockApi({ 'GET /projetos?servico=site_sistema': [naoEntregue] });
    abrirNoAr();
    expect(await screen.findByText('Nenhum site no ar por aqui.')).toBeInTheDocument();
  });

  it('No ar: clicar em qualquer parte da linha abre o projeto', async () => {
    mockApi({ 'GET /projetos?servico=site_sistema': [entregue] });
    abrirNoAr();
    const linhas = await screen.findAllByRole('row');
    await userEvent.setup().click(within(linhas[1]).getAllByRole('cell')[4]);
    expect(await screen.findByText('Outra página')).toBeInTheDocument();
  });

  it('Pede atenção: sem nada pendente mostra que está tudo certo', async () => {
    mockApi({});
    abrir();
    const faixa = await screen.findByRole('region', { name: 'Pede atenção' });
    expect(await within(faixa).findByText('Nada pendente por aqui')).toBeInTheDocument();
  });

  it('Pede atenção: fora do ar, parcelas, mensalidades, teste e trabalho ativo, cada um com seu link', async () => {
    const hoje = hojeISO();
    mockApi({
      'GET /projetos?servico=site_sistema&ficticio=0': [
        { ...naoEntregue, id: 1, titulo: 'Site Ana', etapa: 'andamento' },
        { ...naoEntregue, id: 5, titulo: 'App Dani', etapa: 'prototipo' },
        { ...naoEntregue, id: 6, titulo: 'Loja Edu', etapa: 'prototipo' },
        { ...naoEntregue, id: 7, titulo: 'Site Fabi', etapa: 'teste', teste_inicio: somar(hoje, -9) },
      ],
      'GET /hospedagem/status': [{ projeto_id: 1, tipo: 'vercel', status: 'fora_do_ar', status_desde: null }],
      'GET /parcelas?servico=site_sistema': [
        { id: 1, mensalidade: 0, pago_em: null, estado: 'atrasada', vencimento: somar(hoje, -3) },
        { id: 2, mensalidade: 0, pago_em: null, estado: 'pendente', vencimento: somar(hoje, 3) },
        { id: 3, mensalidade: 0, pago_em: null, estado: 'pendente', vencimento: somar(hoje, 30) },
        { id: 4, mensalidade: 1, pago_em: null, estado: 'atrasada', vencimento: somar(hoje, -3) },
      ],
      'GET /financeiro/mensalidades': { resumo: {}, itens: [
        { projeto_id: 1, servico: 'site_sistema', situacao: 'atrasada' },
        { projeto_id: 9, servico: 'google_meu_negocio', situacao: 'atrasada' },
      ] },
    });
    abrir();
    const faixa = await screen.findByRole('region', { name: 'Pede atenção' });
    const link = (nome) => within(faixa).getByRole('link', { name: nome });
    expect(await within(faixa).findByRole('link', { name: 'Site Ana está fora do ar' })).toHaveAttribute('href', '/projetos/1');
    expect(link('Site Ana está fora do ar')).toHaveClass('pede-atencao__item--perigo');
    expect(link('1 parcela atrasada')).toHaveAttribute('href', '/financeiro?aba=recebimentos');
    expect(link('1 mensalidade atrasada')).toHaveAttribute('href', '/financeiro?aba=mensalidades');
    expect(link('1 parcela vence em até 7 dias')).toHaveClass('pede-atencao__item--atencao');
    expect(link('Teste de Site Fabi já acabou')).toHaveAttribute('href', '/projetos/7');
    expect(link('2 em protótipo')).toHaveAttribute('href', '/servicos?aba=sites&ver=andamento');
    expect(link('Site Ana em versão final')).toHaveAttribute('href', '/projetos/1');
    expect(screen.queryByRole('heading', { name: 'A receber' })).toBeNull();
  });
});
