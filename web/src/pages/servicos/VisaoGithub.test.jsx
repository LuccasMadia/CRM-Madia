import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VisaoGithub } from './VisaoGithub.jsx';
import { mockApi } from '../../test/mockApi.js';
import { renderizar } from '../../test/renderizar.jsx';

const repo = (nome, extra = {}) => ({ nome_completo: `lucas/${nome}`, privado: true, arquivado: false, fork: false, ultimo_commit_em: '2026-11-20T10:00:00Z', url: `https://github.com/lucas/${nome}`, ...extra });
const item = (nome, extra = {}) => ({ repo: repo(nome, extra.repo), projeto: null, sugestao: null, visibilidade: 'privado', alertas: [], ...extra, repo: repo(nome, extra.repo) });

const AUDITORIA = {
  itens: [
    item('site-ana', { projeto: { id: 1, titulo: 'Site Ana', etapa: 'entregue' }, visibilidade: 'publico', alertas: ['publico_entregue'], repo: { privado: false } }),
    item('cardapio-da-dri', { sugestao: { id: 7, titulo: 'Cardápio da Dri' }, alertas: ['sem_projeto'] }),
    item('privado-ok', { projeto: { id: 2, titulo: 'Loja Bia', etapa: 'andamento' } }),
  ],
  projetos_sem_repo: [{ id: 3, titulo: 'App Caio', etapa: 'andamento' }],
  alertas: [
    { codigo: 'publico_entregue', texto: 'Site Ana já foi entregue e o repositório lucas/site-ana está público', link: '/projetos/1' },
    { codigo: 'sem_projeto', texto: 'Repositório lucas/cardapio-da-dri não tem projeto no CRM', link: '/servicos?aba=sites&ver=github' },
    { codigo: 'projeto_sem_repo', texto: 'App Caio não tem repositório no GitHub', link: '/projetos/3' },
  ],
};

describe('VisaoGithub', () => {
  it('sem conexão mostra o chamado para as Configurações', async () => {
    mockApi({ 'GET /github': { conectado: false, usuario: null } });
    renderizar(<VisaoGithub />);
    expect(await screen.findByRole('link', { name: 'Conectar o GitHub' })).toHaveAttribute('href', '/configuracoes');
  });

  it('lista os repositórios com visibilidade, projeto e último commit', async () => {
    mockApi({ 'GET /github': { conectado: true, usuario: 'lucas' }, 'GET /github/repositorios': AUDITORIA });
    renderizar(<VisaoGithub />);
    const linha = await screen.findByRole('row', { name: /lucas\/site-ana/ });
    expect(within(linha).getByText('Público')).toBeInTheDocument();
    expect(within(linha).getByRole('link', { name: 'Site Ana' })).toHaveAttribute('href', '/projetos/1');
    expect(within(linha).getByText('20/11/2026')).toBeInTheDocument();
    expect(within(screen.getByRole('row', { name: /privado-ok/ })).getByText('Privado')).toBeInTheDocument();
  });

  it('destaca os alertas no topo, com o de perigo marcado', async () => {
    mockApi({ 'GET /github': { conectado: true, usuario: 'lucas' }, 'GET /github/repositorios': AUDITORIA });
    renderizar(<VisaoGithub />);
    const perigo = await screen.findByRole('link', { name: 'Site Ana já foi entregue e o repositório lucas/site-ana está público' });
    expect(perigo).toHaveAttribute('href', '/projetos/1');
    expect(perigo).toHaveClass('pede-atencao__item--perigo');
    expect(screen.getByRole('link', { name: 'App Caio não tem repositório no GitHub' })).toHaveAttribute('href', '/projetos/3');
  });

  it('Confirmar liga a sugestão ao projeto e recarrega a auditoria', async () => {
    const { chamadas } = mockApi({
      'GET /github': { conectado: true, usuario: 'lucas' },
      'GET /github/repositorios': AUDITORIA,
      'GET /github/repositorios?atualizar=1': { itens: [], projetos_sem_repo: [], alertas: [] },
      'PUT /projetos/7': { id: 7 },
    });
    renderizar(<VisaoGithub />);
    const linha = await screen.findByRole('row', { name: /cardapio-da-dri/ });
    expect(within(linha).getByText('Cardápio da Dri')).toBeInTheDocument();
    await userEvent.setup().click(within(linha).getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByText('Nenhum repositório encontrado.')).toBeInTheDocument();
    expect(chamadas.find((c) => c.metodo === 'PUT')).toEqual({ metodo: 'PUT', caminho: '/projetos/7', corpo: { github_repo: 'lucas/cardapio-da-dri' } });
  });

  it('Atualizar pede a auditoria de novo sem usar o cache', async () => {
    const { chamadas } = mockApi({
      'GET /github': { conectado: true, usuario: 'lucas' },
      'GET /github/repositorios': AUDITORIA,
      'GET /github/repositorios?atualizar=1': AUDITORIA,
    });
    renderizar(<VisaoGithub />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Atualizar' }));
    await screen.findByRole('row', { name: /lucas\/site-ana/ });
    expect(chamadas.map((c) => c.caminho)).toContain('/github/repositorios?atualizar=1');
  });
});
