import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CartaoGithub } from './CartaoGithub.jsx';
import { mockApi, resposta } from '../../test/mockApi.js';
import { renderizar } from '../../test/renderizar.jsx';

const projeto = { id: 5, titulo: 'Site Ana', servico: 'site_sistema', ficticio: 0, privado: 0, github_repo: null };
const COM_REPO = { ...projeto, github_repo: 'lucas/site-ana' };
const CONECTADO = { conectado: true, usuario: 'lucas' };

describe('CartaoGithub', () => {
  it('com repositório mostra o nome, o selo de visibilidade e o gráfico de commits', async () => {
    mockApi({
      'GET /github': CONECTADO,
      'GET /projetos/5/github': { repo: 'lucas/site-ana', visibilidade: 'publico', encontrado: true, commits: { semanas: [{ semana: '2026-11-01', total: 3 }], calculando: false } },
    });
    renderizar(<CartaoGithub projeto={COM_REPO} />);
    expect(await screen.findByRole('link', { name: 'lucas/site-ana' })).toHaveAttribute('href', 'https://github.com/lucas/site-ana');
    expect(screen.getByText('Público')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Commits por semana/ })).toBeInTheDocument();
  });

  it('sem repositório e conectado, o botão Criar repositório chama o POST e mostra o resultado', async () => {
    const { chamadas } = mockApi({
      'GET /github': CONECTADO,
      'POST /projetos/5/github': { repo: 'lucas/site-ana', visibilidade: 'privado', encontrado: true, commits: { semanas: [], calculando: true } },
    });
    renderizar(<CartaoGithub projeto={projeto} />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Criar repositório' }));
    expect(await screen.findByRole('link', { name: 'lucas/site-ana' })).toBeInTheDocument();
    expect(screen.getByText('Privado')).toBeInTheDocument();
    expect(chamadas.some((c) => c.metodo === 'POST' && c.caminho === '/projetos/5/github')).toBe(true);
  });

  it('sem conexão mostra o link para as Configurações', async () => {
    mockApi({ 'GET /github': { conectado: false, usuario: null } });
    renderizar(<CartaoGithub projeto={projeto} />);
    expect(await screen.findByRole('link', { name: 'Conectar o GitHub' })).toHaveAttribute('href', '/configuracoes');
  });

  it('repositório apagado no GitHub mostra que não foi encontrado', async () => {
    mockApi({ 'GET /github': CONECTADO, 'GET /projetos/5/github': { repo: 'lucas/site-ana', visibilidade: null, encontrado: false, commits: null } });
    renderizar(<CartaoGithub projeto={COM_REPO} />);
    expect(await screen.findByText('Repositório não encontrado no GitHub')).toBeInTheDocument();
  });

  it('calculando commits mostra o aviso', async () => {
    mockApi({ 'GET /github': CONECTADO, 'GET /projetos/5/github': { repo: 'lucas/site-ana', visibilidade: 'privado', encontrado: true, commits: { semanas: [], calculando: true } } });
    renderizar(<CartaoGithub projeto={COM_REPO} />);
    expect(await screen.findByText('Calculando commits…')).toBeInTheDocument();
  });

  it('falha ao criar mostra o erro e mantém o botão', async () => {
    mockApi({ 'GET /github': CONECTADO, 'POST /projetos/5/github': resposta(502, { erro: 'Token do GitHub inválido ou sem permissão. Cole um novo em Configurações → GitHub.' }) });
    renderizar(<CartaoGithub projeto={projeto} />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Criar repositório' }));
    expect(await screen.findByText(/Token do GitHub inválido/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Criar repositório' })).toBeInTheDocument();
  });

  it('não aparece para projeto fictício, interno ou de outro serviço', () => {
    mockApi({ 'GET /github': CONECTADO });
    for (const extra of [{ ficticio: 1 }, { privado: 1, ficticio: 1 }, { servico: 'google_meu_negocio' }]) {
      const { container, unmount } = renderizar(<CartaoGithub projeto={{ ...projeto, ...extra }} />);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });
});
