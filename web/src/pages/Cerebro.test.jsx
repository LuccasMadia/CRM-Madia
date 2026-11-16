import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Cerebro } from './Cerebro.jsx';
import { mockApi } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';
import { ALVO_TOQUE } from './cerebro/AneisCerebro.jsx';

const area = (id, rotulo, pontos = []) => ({ id, rotulo, pontos });
const DADOS = {
  centro: { texto: '# Cérebro da Madia' },
  skills: [{ id: 'relatorio', nome: 'Relatório', descricao: 'Gera o relatório de projetos' }],
  rotinas: [{ id: 'checar', nome: 'Checar sites', o_que_faz: 'Vê se os sites estão no ar', frequencia: 'a cada 5 minutos', estado: 'ativa', ultima_execucao: null }],
  apps: [{ id: 'instagram', nome: 'Instagram', para_que: 'Publicar conteúdo', conexao: 'crm:instagram_token', conectado: true }],
  memoria: {
    areas: [
      area('clientes', 'Clientes', [{ id: 'cliente:1', rotulo: 'Ana', destaque: false, link: '/clientes/1', resumo: 'Cliente desde 2025' }]),
      area('comercial', 'Comercial'),
      area('projetos', 'Projetos', [{ id: 'projeto:12', rotulo: 'Site da Ana', destaque: true, link: '/projetos/12', resumo: 'Ana · Andamento · prazo 01/11/2026' }]),
      area('processos', 'Processos'),
      area('administrativo', 'Administrativo'),
      area('conteudo', 'Conteúdo'),
    ],
  },
  pede_atencao: [{ texto: '1 projeto atrasado', tom: 'perigo', para: '/projetos/12' }],
  avisos: [],
};

describe('Cerebro', () => {
  it('mostra o que pede atenção e os rótulos das 6 áreas', async () => {
    mockApi({ 'GET /cerebro': DADOS });
    renderizar(<Cerebro />);
    expect(await screen.findByText('1 projeto atrasado')).toBeInTheDocument();
    for (const rotulo of ['Clientes', 'Comercial', 'Projetos', 'Processos', 'Administrativo', 'Conteúdo']) {
      expect(screen.getByText(rotulo)).toBeInTheDocument();
    }
  });

  it('passar o mouse num ponto liga ele ao que está conectado e apaga o resto; sair desfaz', async () => {
    const comLigacao = structuredClone(DADOS);
    comLigacao.memoria.areas[2].pontos[0].ligacoes = ['cliente:1'];
    mockApi({ 'GET /cerebro': comLigacao });
    const { container } = renderizar(<Cerebro />);
    const user = userEvent.setup();
    const ponto = await screen.findByRole('button', { name: 'Site da Ana' });
    await user.hover(ponto);
    expect(container.querySelectorAll('.aneis__ligacoes line')).toHaveLength(1);
    expect(container.querySelector('svg.aneis')).toHaveClass('aneis--com-foco');
    const nomes = [...container.querySelectorAll('.aneis__nomes-ligados text')].map((t) => t.textContent);
    expect(nomes.sort()).toEqual(['Ana', 'Site da Ana']);
    await user.unhover(ponto);
    expect(container.querySelectorAll('.aneis__ligacoes line')).toHaveLength(0);
    expect(container.querySelector('svg.aneis')).not.toHaveClass('aneis--com-foco');
  });

  it('clicar num ponto abre o painel com o resumo e o link para o CRM', async () => {
    mockApi({ 'GET /cerebro': DADOS });
    renderizar(<Cerebro />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Site da Ana' }));
    const painel = screen.getByRole('complementary', { name: 'Site da Ana' });
    expect(within(painel).getByText('Ana · Andamento · prazo 01/11/2026')).toBeInTheDocument();
    expect(within(painel).getByRole('link', { name: 'Abrir no CRM' })).toHaveAttribute('href', '/projetos/12');
  });

  it('Enter num ponto também abre o painel, e Fechar some com ele', async () => {
    mockApi({ 'GET /cerebro': DADOS });
    renderizar(<Cerebro />);
    const user = userEvent.setup();
    (await screen.findByRole('button', { name: 'Relatório' })).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('complementary', { name: 'Relatório' })).toHaveTextContent('Gera o relatório de projetos');
    await user.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('sem pasta configurada, o centro leva para as configurações', async () => {
    mockApi({ 'GET /cerebro': { ...DADOS, centro: null } });
    renderizar(<Cerebro />);
    expect(await screen.findByRole('link', { name: 'Configure a pasta do cérebro' })).toHaveAttribute('href', '/configuracoes');
  });

  it('mostra os avisos da pasta', async () => {
    mockApi({ 'GET /cerebro': { ...DADOS, avisos: ['rotinas.json inválido', 'apps.json não encontrado'] } });
    renderizar(<Cerebro />);
    expect(await screen.findByRole('alert')).toHaveTextContent('rotinas.json inválido');
    expect(screen.getByRole('alert')).toHaveTextContent('apps.json não encontrado');
  });

  it('ponto que pede ação vem depois dos outros da área (fica por cima) e todo ponto tem alvo de toque grande', async () => {
    const projetos = area('projetos', 'Projetos', [
      { id: 'projeto:12', rotulo: 'Site da Ana', destaque: true, link: '/projetos/12', resumo: 'atrasado' },
      { id: 'projeto:13', rotulo: 'Site do Bruno', destaque: false, link: '/projetos/13', resumo: 'em dia' },
      { id: 'projeto:14', rotulo: 'Site da Carla', destaque: false, link: '/projetos/14', resumo: 'em dia' },
    ]);
    mockApi({ 'GET /cerebro': { ...DADOS, memoria: { areas: DADOS.memoria.areas.map((a) => (a.id === 'projetos' ? projetos : a)) } } });
    renderizar(<Cerebro />);
    const destaque = await screen.findByRole('button', { name: 'Site da Ana' });
    for (const nome of ['Site do Bruno', 'Site da Carla']) {
      const outro = screen.getByRole('button', { name: nome });
      expect(outro.compareDocumentPosition(destaque) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    for (const nome of ['Ana', 'Site da Ana', 'Site do Bruno', 'Site da Carla']) {
      expect(Number(screen.getByRole('button', { name: nome }).getAttribute('r'))).toBeGreaterThanOrEqual(ALVO_TOQUE);
    }
    expect(ALVO_TOQUE).toBeGreaterThanOrEqual(9);
  });

  it('skills, rotinas, apps e o centro vêm antes dos pontos da memória na ordem do Tab', async () => {
    mockApi({ 'GET /cerebro': DADOS });
    renderizar(<Cerebro />);
    const ponto = await screen.findByRole('button', { name: 'Ana' });
    for (const nome of ['CLAUDE.md', 'Relatório', 'Checar sites', 'Instagram']) {
      expect(screen.getByRole('button', { name: nome }).compareDocumentPosition(ponto) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('clicar numa área aproxima a fatia e "Ver tudo" volta ao anel inteiro', async () => {
    mockApi({ 'GET /cerebro': DADOS });
    renderizar(<Cerebro />);
    const user = userEvent.setup();
    await user.click(await screen.findByText('Projetos'));
    const svg = screen.getByRole('group', { name: 'Mapa do cérebro' });
    expect(svg).not.toHaveAttribute('viewBox', '0 0 600 600');
    await user.click(screen.getByRole('button', { name: 'Ver tudo' }));
    expect(svg).toHaveAttribute('viewBox', '0 0 600 600');
  });
});
