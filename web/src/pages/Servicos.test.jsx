import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Servicos } from './Servicos.jsx';
import { mockApi } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';

const site = {
  id: 1, cliente_id: 10, titulo: 'Site Ana', cliente_nome: 'Ana', etapa: 'andamento',
  valor_total_centavos: 250000, atualizado_em: '2026-09-01T10:00:00.000Z', postou_instagram: 0,
};
const gmnPendente = {
  id: 6, cliente_id: 10, cliente_nome: 'Ana', titulo: 'Google Meu Negócio', servico: 'google_meu_negocio', etapa: 'andamento',
  valor_total_centavos: 20000, link_perfil: 'https://g.page/ana', data_entrega: null, atualizado_em: '2026-09-02T10:00:00.000Z',
};
const gmnConfigurado = {
  id: 7, cliente_id: 11, cliente_nome: 'Bruno', titulo: 'Google Meu Negócio', servico: 'google_meu_negocio', etapa: 'entregue',
  valor_total_centavos: 15000, link_perfil: null, data_entrega: '2026-09-15', atualizado_em: '2026-09-15T10:00:00.000Z',
};

const placasPendente = { id: 8, servico: 'placas_nfc', etapa: 'andamento' };
const placasEntregue = { id: 9, servico: 'placas_nfc', etapa: 'entregue' };
const siteContato = { ...site, id: 2, etapa: 'contato' };

const rotas = {
  'GET /projetos': [{ ...site, servico: 'site_sistema' }, siteContato, gmnPendente, gmnConfigurado, placasPendente, placasEntregue],
  'GET /projetos?servico=site_sistema': [site],
  'GET /projetos?servico=google_meu_negocio': [gmnPendente, gmnConfigurado],
  'GET /clientes': [],
};

const abrir = (rota = '/servicos') => renderizar(<Servicos />, { rota, padrao: '/servicos' });

describe('Servicos', () => {
  it('abre em Sites e Sistemas, com um card por serviço', async () => {
    mockApi(rotas);
    abrir();
    expect(screen.getByRole('heading', { name: 'Serviços' })).toBeInTheDocument();
    const cards = screen.getAllByRole('tab');
    expect(cards.map((c) => c.querySelector('.card-servico__nome').textContent)).toEqual(['Sites e Sistemas', 'Google Meu Negócio', 'Placas NFC']);
    expect(cards.every((c) => c.classList.contains('card-servico') && c.querySelector('svg'))).toBe(true);
    expect(screen.getByRole('tab', { name: /Sites e Sistemas/ })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('link', { name: 'Site Ana' })).toHaveAttribute('href', '/projetos/1');
  });

  it('a aba vem do endereço e trocar de aba atualiza o endereço', async () => {
    mockApi({ ...rotas, 'GET /placas/resumo': { lucro_previsto_por_modelo: [], lucro_real_por_modelo: [], materiais: [], prejuizo_avarias: { total_centavos: 0, por_modelo: [] } } });
    abrir('/servicos?aba=gmn');
    expect(screen.getByRole('tab', { name: /Google Meu Negócio/ })).toHaveAttribute('aria-selected', 'true');
    await screen.findByRole('link', { name: 'Bruno' });
    await userEvent.setup().click(screen.getByRole('tab', { name: /Placas NFC/ }));
    expect(screen.getByRole('tab', { name: /Placas NFC/ })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('tab', { name: 'Resumo' })).toBeInTheDocument();
  });

  it('aba GMN lista todos os clientes, com situação e link para o perfil', async () => {
    mockApi(rotas);
    abrir('/servicos?aba=gmn');
    const linhas = await screen.findAllByRole('row');
    expect(within(linhas[1]).getByRole('link', { name: 'Bruno' })).toHaveAttribute('href', '/clientes/11?aba=gmn');
    expect(within(linhas[1]).getByText('Configurado em 15/09/2026')).toBeInTheDocument();
    expect(within(linhas[2]).getByRole('link', { name: 'Ana' })).toHaveAttribute('href', '/clientes/10?aba=gmn');
    expect(within(linhas[2]).getByText('Pendente')).toBeInTheDocument();
    expect(within(linhas[2]).getByRole('link', { name: 'https://g.page/ana' })).toBeInTheDocument();
    expect(within(linhas[2]).getByText(/R\$\s*200,00/)).toBeInTheDocument();
  });

  it('aba GMN filtra pendentes e configurados', async () => {
    mockApi(rotas);
    abrir('/servicos?aba=gmn');
    await screen.findByRole('link', { name: 'Bruno' });
    const usuario = userEvent.setup();
    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Situação' }), 'pendente');
    expect(screen.queryByRole('link', { name: 'Bruno' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Ana' })).toBeInTheDocument();
    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Situação' }), 'configurado');
    expect(screen.queryByRole('link', { name: 'Ana' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Bruno' })).toBeInTheDocument();
  });

  it('aba GMN vazia avisa', async () => {
    mockApi({ ...rotas, 'GET /projetos?servico=google_meu_negocio': [] });
    abrir('/servicos?aba=gmn');
    expect(await screen.findByText('Nenhum Google Meu Negócio encontrado.')).toBeInTheDocument();
  });

  it('cada card mostra o número do que está pendente', async () => {
    mockApi(rotas);
    abrir();
    expect(await screen.findByText('1 em andamento')).toBeInTheDocument();
    expect(screen.getByText('1 pendente')).toBeInTheDocument();
    expect(screen.getByText('1 a entregar')).toBeInTheDocument();
  });

  it('usa plural nos números', async () => {
    mockApi({ ...rotas, 'GET /projetos': [gmnPendente, { ...gmnPendente, id: 10 }] });
    abrir();
    expect(await screen.findByText('2 pendentes')).toBeInTheDocument();
    expect(screen.getByText('0 em andamento')).toBeInTheDocument();
    expect(screen.getByText('0 a entregar')).toBeInTheDocument();
  });

  it('se a contagem falhar, os cards aparecem sem número', async () => {
    const { rotas: r } = mockApi({ ...rotas });
    delete r['GET /projetos'];
    abrir();
    expect(await screen.findByRole('link', { name: 'Site Ana' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Placas NFC/ })).toBeInTheDocument();
    expect(screen.queryByText(/em andamento/)).toBeNull();
  });
});
