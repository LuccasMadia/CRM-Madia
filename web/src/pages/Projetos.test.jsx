import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Projetos } from './Projetos.jsx';
import { mockApi } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';

const antigo = {
  id: 1, cliente_id: 10, titulo: 'Site Ana', cliente_nome: 'Ana', etapa: 'andamento',
  valor_total_centavos: 250000, atualizado_em: '2026-09-01T10:00:00.000Z', postou_instagram: 0,
};
const recente = {
  id: 2, cliente_id: 11, titulo: 'Loja Bruno', cliente_nome: 'Bruno', etapa: 'contato',
  valor_total_centavos: 500000, atualizado_em: '2026-09-20T10:00:00.000Z', postou_instagram: 1,
};
const perdido = {
  id: 3, cliente_id: 12, titulo: 'App Carla', cliente_nome: 'Carla', etapa: 'perdido',
  valor_total_centavos: 0, atualizado_em: '2026-09-10T10:00:00.000Z',
};

const abrir = () => renderizar(<Projetos />, { rota: '/projetos', padrao: '/projetos' });

describe('Projetos', () => {
  it('lista projetos ativos mais recentes primeiro e oculta perdidos', async () => {
    mockApi({ 'GET /projetos': [antigo, recente, perdido], 'GET /clientes': [] });
    abrir();
    const linhas = await screen.findAllByRole('row');
    expect(within(linhas[1]).getByRole('link', { name: 'Loja Bruno' })).toHaveAttribute('href', '/projetos/2');
    expect(within(linhas[2]).getByRole('link', { name: 'Site Ana' })).toHaveAttribute('href', '/projetos/1');
    expect(within(linhas[1]).getByText('Sim')).toBeInTheDocument();
    expect(within(linhas[2]).getByText('Não')).toBeInTheDocument();
    expect(screen.queryByText('App Carla')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ana' })).toHaveAttribute('href', '/clientes/10');
    expect(screen.getByText(/5\.000,00/)).toBeInTheDocument();
  });

  it('filtra por etapa mostrando perdidos quando selecionado explicitamente', async () => {
    const { chamadas } = mockApi({
      'GET /projetos': [antigo, recente, perdido],
      'GET /projetos?etapa=perdido': [perdido],
      'GET /clientes': [],
    });
    abrir();
    await screen.findByText('Site Ana');
    await userEvent.setup().selectOptions(screen.getByLabelText('Etapa'), 'perdido');
    await screen.findByText('App Carla');
    expect(chamadas.map((c) => c.caminho)).toContain('/projetos?etapa=perdido');
  });

  it('filtra por cliente', async () => {
    const { chamadas } = mockApi({
      'GET /projetos': [antigo, recente],
      'GET /projetos?cliente_id=10': [antigo],
      'GET /clientes': [{ id: 10, nome: 'Ana' }],
    });
    abrir();
    await screen.findByText('Loja Bruno');
    await userEvent.setup().selectOptions(screen.getByLabelText('Cliente'), '10');
    await screen.findByText('Site Ana');
    expect(screen.queryByText('Loja Bruno')).not.toBeInTheDocument();
    expect(chamadas.map((c) => c.caminho)).toContain('/projetos?cliente_id=10');
  });

  it('mostra estado vazio', async () => {
    mockApi({ 'GET /projetos': [], 'GET /clientes': [] });
    abrir();
    expect(await screen.findByText('Nenhum projeto encontrado.')).toBeInTheDocument();
  });

  it('filtra por instagram', async () => {
    const { chamadas } = mockApi({
      'GET /projetos': [antigo, recente],
      'GET /projetos?postou_instagram=1': [recente],
      'GET /clientes': [],
    });
    abrir();
    await screen.findByText('Site Ana');
    await userEvent.setup().selectOptions(screen.getByLabelText('Instagram'), '1');
    await screen.findByText('Loja Bruno');
    expect(screen.queryByText('Site Ana')).not.toBeInTheDocument();
    expect(chamadas.map((c) => c.caminho)).toContain('/projetos?postou_instagram=1');
  });
});
