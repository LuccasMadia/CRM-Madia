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
const siteContato = { ...site, id: 2, etapa: 'ideia' };

const rotas = {
  'GET /projetos': [{ ...site, servico: 'site_sistema' }, { ...site, id: 3, servico: 'site_sistema', etapa: 'prototipo' }, { ...site, id: 4, servico: 'site_sistema', etapa: 'teste' }, siteContato, gmnPendente, gmnConfigurado, placasPendente, placasEntregue],
  'GET /projetos?servico=site_sistema': [site],
  'GET /projetos?servico=google_meu_negocio': [gmnPendente, gmnConfigurado],
  'GET /clientes': [],
  'GET /servicos/resumo': {
    site_sistema: { a_receber_centavos: 0 },
    google_meu_negocio: { a_receber_centavos: 20000 },
    placas_nfc: { a_receber_centavos: 8000, vendas_a_receber: 2, montadas: 3 },
  },
};

const abrir = (rota = '/servicos') => renderizar(<Servicos />, { rota, padrao: '/servicos' });

describe('Servicos', () => {
  it('abre em Sites e Sistemas, com uma aba por serviço', async () => {
    mockApi(rotas);
    abrir();
    expect(screen.getByRole('heading', { name: 'Serviços' })).toBeInTheDocument();
    const cards = screen.getAllByRole('tab');
    expect(cards.map((c) => c.querySelector('.abas__nome').textContent)).toEqual(['Sites e Sistemas', 'Google Meu Negócio', 'Placas NFC']);
    expect(cards.every((c) => c.classList.contains('abas__aba') && c.querySelector('svg'))).toBe(true);
    expect(screen.getByRole('tab', { name: /Sites e Sistemas/ })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('link', { name: 'Site Ana' })).toHaveAttribute('href', '/projetos/1');
  });

  it('a aba vem do endereço e trocar de aba atualiza o endereço', async () => {
    mockApi({ ...rotas, 'GET /placas/resumo': { lucro_previsto_por_modelo: [], lucro_real_por_modelo: [], materiais: [], prejuizo_avarias: { total_centavos: 0, por_modelo: [] }, a_receber: { total_centavos: 0, vendas: [] }, montadas: [], mes: { vendidas: 0, lucro_centavos: 0 } } });
    abrir('/servicos?aba=gmn');
    expect(screen.getByRole('tab', { name: /Google Meu Negócio/ })).toHaveAttribute('aria-selected', 'true');
    await screen.findByRole('link', { name: 'Bruno' });
    await userEvent.setup().click(screen.getByRole('tab', { name: /Placas NFC/ }));
    expect(screen.getByRole('tab', { name: /Placas NFC/ })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('tab', { name: 'Estoque' })).toBeInTheDocument();
  });

  // o detalhe da aba (pede atenção, ações na linha) fica em servicos/GoogleMeuNegocio.test.jsx
  it('aba GMN mostra pendentes antes dos configurados, com link para o perfil', async () => {
    mockApi({ ...rotas, 'GET /parcelas?servico=google_meu_negocio': [] });
    abrir('/servicos?aba=gmn');
    await screen.findByRole('link', { name: 'Bruno' });
    const linhas = screen.getAllByRole('row');
    expect(within(linhas[2]).getByRole('link', { name: 'Ana' })).toHaveAttribute('href', '/clientes/10?aba=gmn');
    expect(within(linhas[4]).getByText('Configurado em 15/09/2026')).toBeInTheDocument();
  });

  it('aba GMN vazia avisa', async () => {
    mockApi({ ...rotas, 'GET /projetos?servico=google_meu_negocio': [], 'GET /parcelas?servico=google_meu_negocio': [] });
    abrir('/servicos?aba=gmn');
    expect(await screen.findByText('Nenhum Google Meu Negócio ainda.')).toBeInTheDocument();
  });

  it('cada aba mostra só a contagem do que está pendente, sem dinheiro', async () => {
    mockApi(rotas);
    abrir();
    expect(await screen.findByLabelText('2 em andamento')).toHaveTextContent(/^2$/);
    expect(await screen.findByLabelText('1 pendente')).toHaveTextContent(/^1$/);
    expect(await screen.findByLabelText('2 vendas a receber')).toHaveTextContent(/^2$/);
    expect(screen.getByRole('tablist')).not.toHaveTextContent('R$');
  });

  it('sem pendências a aba não mostra contador', async () => {
    const semReceber = { a_receber_centavos: 0 };
    mockApi({
      ...rotas,
      'GET /projetos': [gmnPendente, { ...gmnPendente, id: 10 }],
      'GET /servicos/resumo': { site_sistema: semReceber, google_meu_negocio: semReceber, placas_nfc: { ...semReceber, vendas_a_receber: 0, montadas: 1 } },
    });
    abrir();
    expect(await screen.findByLabelText('2 pendentes')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Sites e Sistemas/ }).querySelector('.contador')).toBeNull();
    expect(screen.getByRole('tab', { name: /Placas NFC/ }).querySelector('.contador')).toBeNull();
  });

  it('se a contagem falhar, os cards aparecem sem número', async () => {
    const { rotas: r } = mockApi({ ...rotas });
    delete r['GET /projetos'];
    abrir();
    expect(await screen.findByRole('link', { name: 'Site Ana' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Placas NFC/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Sites e Sistemas/ }).querySelector('.contador')).toBeNull();
  });
});
