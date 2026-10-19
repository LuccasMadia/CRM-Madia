import { describe, it, expect, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SitesSistemas } from './SitesSistemas.jsx';
import { mockApi } from '../../test/mockApi.js';
import { renderizar } from '../../test/renderizar.jsx';

const antigo = {
  id: 1, cliente_id: 10, titulo: 'Site Ana', cliente_nome: 'Ana', etapa: 'andamento',
  valor_total_centavos: 250000, atualizado_em: '2026-09-01T10:00:00.000Z', postou_instagram: 0,
};
const recente = {
  id: 2, cliente_id: 11, titulo: 'Loja Bruno', cliente_nome: 'Bruno', etapa: 'ideia',
  valor_total_centavos: 500000, atualizado_em: '2026-09-20T10:00:00.000Z', postou_instagram: 1, no_portfolio: 1,
};
const perdido = {
  id: 3, cliente_id: 12, titulo: 'App Carla', cliente_nome: 'Carla', etapa: 'perdido',
  valor_total_centavos: 0, atualizado_em: '2026-09-10T10:00:00.000Z',
};

const abrir = () => renderizar(<SitesSistemas />, { rota: '/servicos', padrao: '/servicos' });

describe('SitesSistemas', () => {
  beforeEach(() => localStorage.clear());

  it('alterna entre lista e funil, e lembra a última visão', async () => {
    mockApi({ 'GET /projetos?servico=site_sistema': [antigo], 'GET /projetos?servico=site_sistema&ficticio=0': [antigo], 'GET /clientes': [] });
    const { unmount } = abrir();
    const visao = screen.getByRole('group', { name: 'Visão' });
    expect(within(visao).getByRole('button', { name: 'Lista' })).toHaveAttribute('aria-pressed', 'true');
    await screen.findByRole('row', { name: /Site Ana/ });
    await userEvent.setup().click(within(visao).getByRole('button', { name: 'Funil' }));
    expect(await screen.findByRole('region', { name: 'Versão final' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Etapa' })).toBeNull();
    expect(localStorage.getItem('crm.sitesVisao')).toBe('funil');
    unmount();
    abrir();
    expect(await screen.findByRole('region', { name: 'Versão final' })).toBeInTheDocument();
  });

  it('+ Oportunidade também fica na lista', async () => {
    mockApi({ 'GET /projetos?servico=site_sistema': [], 'GET /clientes': [], 'GET /categorias': [], 'GET /nichos': [] });
    abrir();
    await userEvent.setup().click(screen.getByRole('button', { name: '+ Oportunidade' }));
    expect(await screen.findByRole('dialog', { name: 'Nova oportunidade' })).toBeInTheDocument();
  });

  it('lista projetos ativos mais recentes primeiro e oculta perdidos', async () => {
    mockApi({ 'GET /projetos?servico=site_sistema': [antigo, recente, perdido], 'GET /clientes': [] });
    abrir();
    const linhas = await screen.findAllByRole('row');
    expect(within(linhas[1]).getByRole('link', { name: 'Loja Bruno' })).toHaveAttribute('href', '/projetos/2');
    expect(within(linhas[2]).getByRole('link', { name: 'Site Ana' })).toHaveAttribute('href', '/projetos/1');
    expect(within(linhas[1]).getByRole('img', { name: 'Postou no Instagram' })).toBeInTheDocument();
    expect(within(linhas[1]).getByRole('img', { name: 'No portfólio' })).toBeInTheDocument();
    expect(within(linhas[2]).queryByRole('img', { name: 'Postou no Instagram' })).toBeNull();
    expect(within(linhas[2]).queryByRole('img', { name: 'No portfólio' })).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(within(linhas[2]).getByText('Versão final')).toHaveClass('etapa', 'etapa--andamento');
    expect(screen.queryByText('App Carla')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ana' })).toHaveAttribute('href', '/clientes/10');
    expect(screen.getByText(/5\.000,00/)).toBeInTheDocument();
  });

  it('filtra por etapa mostrando perdidos quando selecionado explicitamente', async () => {
    const { chamadas } = mockApi({
      'GET /projetos?servico=site_sistema': [antigo, recente, perdido],
      'GET /projetos?servico=site_sistema&etapa=perdido': [perdido],
      'GET /clientes': [],
    });
    abrir();
    await screen.findByText('Site Ana');
    expect(screen.getByRole('button', { name: 'Ativos' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Perdidos' }));
    expect(screen.getByRole('button', { name: 'Perdidos' })).toHaveAttribute('aria-pressed', 'true');
    await screen.findByText('App Carla');
    expect(chamadas.map((c) => c.caminho)).toContain('/projetos?servico=site_sistema&etapa=perdido');
  });

  it('filtra por cliente', async () => {
    const { chamadas } = mockApi({
      'GET /projetos?servico=site_sistema': [antigo, recente],
      'GET /projetos?servico=site_sistema&cliente_id=10': [antigo],
      'GET /clientes': [{ id: 10, nome: 'Ana' }],
    });
    abrir();
    await screen.findByText('Loja Bruno');
    await userEvent.setup().selectOptions(screen.getByLabelText('Cliente'), '10');
    await screen.findByText('Site Ana');
    expect(screen.queryByText('Loja Bruno')).not.toBeInTheDocument();
    expect(chamadas.map((c) => c.caminho)).toContain('/projetos?servico=site_sistema&cliente_id=10');
  });

  it('mostra estado vazio', async () => {
    mockApi({ 'GET /projetos?servico=site_sistema': [], 'GET /clientes': [] });
    abrir();
    expect(await screen.findByText('Nenhum projeto encontrado.')).toBeInTheDocument();
  });

  it('filtra por instagram', async () => {
    const { chamadas } = mockApi({
      'GET /projetos?servico=site_sistema': [antigo, recente],
      'GET /projetos?servico=site_sistema&postou_instagram=1': [recente],
      'GET /clientes': [],
    });
    abrir();
    await screen.findByText('Site Ana');
    await userEvent.setup().selectOptions(screen.getByLabelText('Instagram'), '1');
    await screen.findByText('Loja Bruno');
    expect(screen.queryByText('Site Ana')).not.toBeInTheDocument();
    expect(chamadas.map((c) => c.caminho)).toContain('/projetos?servico=site_sistema&postou_instagram=1');
  });

  it('filtros de etapa em pílulas, na ordem do funil', async () => {
    mockApi({ 'GET /projetos?servico=site_sistema': [], 'GET /clientes': [] });
    abrir();
    const grupo = await screen.findByRole('group', { name: 'Etapa' });
    expect(within(grupo).getAllByRole('button').map((b) => b.textContent))
      .toEqual(['Ativos', 'Ideia', 'Protótipo', 'Apresentado', 'Valor definido', 'Em teste', 'Versão final', 'Entregue', 'Perdidos']);
  });

  it('valor zerado aparece como travessão', async () => {
    mockApi({ 'GET /projetos?servico=site_sistema': [{ ...antigo, valor_total_centavos: 0 }], 'GET /clientes': [] });
    abrir();
    const linhas = await screen.findAllByRole('row');
    expect(within(linhas[1]).getByText('—')).toBeInTheDocument();
    expect(within(linhas[1]).queryByText(/R$/)).toBeNull();
  });

  it('clicar em qualquer parte da linha abre o projeto', async () => {
    mockApi({ 'GET /projetos?servico=site_sistema': [antigo], 'GET /clientes': [] });
    abrir();
    const linhas = await screen.findAllByRole('row');
    await userEvent.setup().click(within(linhas[1]).getByText('Versão final'));
    expect(await screen.findByText('Outra página')).toBeInTheDocument();
  });
});
