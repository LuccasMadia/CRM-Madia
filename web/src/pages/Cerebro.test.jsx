import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Cerebro } from './Cerebro.jsx';
import { mockApi } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';

const ponto = (id, tipo, rotulo, extra = {}) => ({ id, tipo, rotulo, destaque: false, vivo: true, link: null, ligacoes: [], resumo: `Resumo de ${rotulo}`, texto: null, ...extra });
const area = (id, rotulo, pontos = []) => ({ id, rotulo, pontos });
const DADOS = {
  centro: { texto: '# Cérebro da Madia' },
  skills: [{ id: 'relatorio', nome: 'Relatório', descricao: 'Gera o relatório de projetos', texto: 'texto da skill' }],
  rotinas: [{ id: 'checar', nome: 'Checar sites', o_que_faz: 'Vê se os sites estão no ar', frequencia: 'a cada 5 minutos', estado: 'ativa', ultima_execucao: null }],
  apps: [{ id: 'instagram', nome: 'Instagram', para_que: 'Publicar conteúdo', conexao: 'crm:instagram_token', conectado: true }],
  memoria: {
    areas: [
      area('clientes', 'Clientes', [ponto('cliente:1', 'cliente', 'Ana', { link: '/clientes/1' })]),
      area('comercial', 'Comercial'),
      area('projetos', 'Projetos', [
        ponto('projeto:12', 'projeto', 'Site da Ana', { destaque: true, link: '/projetos/12', ligacoes: ['cliente:1', 'projeto:99', 'app:instagram'] }),
        ponto('projeto:7', 'projeto', 'Site antigo', { vivo: false, link: '/projetos/7' }),
      ]),
      area('processos', 'Processos', [ponto('tarefa:1', 'tarefa', 'Fazer logo', { ligacoes: ['projeto:12'] })]),
      area('administrativo', 'Administrativo'),
      area('conteudo', 'Conteúdo'),
      area('arquivos', 'Arquivos', [ponto('arquivo:rel', 'arquivo', 'relatorio-2026', { texto: 'linha 1\nlinha 2 do relatório inteiro' })]),
    ],
  },
  pede_atencao: [{ texto: '1 projeto atrasado', tom: 'perigo', para: '/projetos/12' }],
  avisos: [],
};

async function abrirPelaLista(nome) {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Lista' }));
  await user.click(within(screen.getByRole('region', { name: 'Lista do cérebro' })).getByRole('button', { name: nome }));
  return user;
}

describe('Cerebro', () => {
  it('mostra pede atenção, o canvas com aria-label e os botões Legenda e Lista', async () => {
    mockApi({ 'GET /cerebro': DADOS });
    renderizar(<Cerebro />);
    expect(await screen.findByText('1 projeto atrasado')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Mapa do cérebro: .*Projetos 2/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Legenda' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lista' })).toBeInTheDocument();
    expect(screen.getByText('Madia · Cérebro')).toBeInTheDocument();
  });

  it('Lista: vivos à vista, histórico recolhido com a contagem; clicar abre o cartão', async () => {
    mockApi({ 'GET /cerebro': DADOS });
    renderizar(<Cerebro />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Lista' }));
    const lista = screen.getByRole('region', { name: 'Lista do cérebro' });
    const projetos = within(lista).getByRole('heading', { name: 'Projetos' }).closest('section');
    const detalhes = projetos.querySelector('details');
    expect(detalhes.open).toBe(false);
    expect(within(detalhes).getByText('Histórico (1)')).toBeInTheDocument();
    expect(within(detalhes).getByRole('button', { name: 'Site antigo', hidden: true })).toBeInTheDocument();
    for (const nome of ['CLAUDE.md', 'Relatório', 'Checar sites', 'Instagram']) {
      expect(within(lista).getByRole('button', { name: nome })).toBeInTheDocument();
    }
    await user.click(within(projetos).getByRole('button', { name: 'Site da Ana' }));
    expect(screen.getByRole('complementary', { name: 'Site da Ana' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Lista do cérebro' })).not.toBeInTheDocument();
  });

  it('cartão mostra etiquetas Projeto/Histórico e Ligado a com botão para vizinho no mapa, sem o fictício', async () => {
    mockApi({ 'GET /cerebro': DADOS });
    renderizar(<Cerebro />);
    const user = await abrirPelaLista('Site antigo');
    let cartao = screen.getByRole('complementary', { name: 'Site antigo' });
    expect(within(cartao).getByText('Projeto')).toBeInTheDocument();
    expect(within(cartao).getByText('Histórico')).toBeInTheDocument();
    expect(within(cartao).queryByText('Pede ação')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Lista' }));
    await user.click(screen.getByRole('button', { name: 'Site da Ana' }));
    cartao = screen.getByRole('complementary', { name: 'Site da Ana' });
    expect(within(cartao).getByText('Pede ação')).toBeInTheDocument();
    const ligado = within(cartao).getByRole('heading', { name: 'Ligado a' }).parentElement;
    expect(within(ligado).getByRole('button', { name: 'Ana' })).toBeInTheDocument();
    expect(within(ligado).getByRole('button', { name: 'Instagram' })).toBeInTheDocument();
    expect(within(ligado).getAllByRole('listitem')).toHaveLength(3); // Ana, Fazer logo, Instagram; projeto:99 some

    await user.click(within(ligado).getByRole('button', { name: 'Ana' }));
    expect(screen.getByRole('complementary', { name: 'Ana' })).toBeInTheDocument();
  });

  it('Abrir no CRM só aparece quando há link', async () => {
    mockApi({ 'GET /cerebro': DADOS });
    renderizar(<Cerebro />);
    const user = await abrirPelaLista('Site da Ana');
    expect(screen.getByRole('link', { name: 'Abrir no CRM' })).toHaveAttribute('href', '/projetos/12');
    await user.click(screen.getByRole('button', { name: 'Lista' }));
    await user.click(within(screen.getByRole('region', { name: 'Lista do cérebro' })).getByRole('button', { name: 'Fazer logo' }));
    expect(screen.queryByRole('link', { name: 'Abrir no CRM' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Voar até' })).not.toBeInTheDocument();
  });

  it('arquivo abre o painel de conteúdo com o texto inteiro', async () => {
    mockApi({ 'GET /cerebro': DADOS });
    renderizar(<Cerebro />);
    await abrirPelaLista('relatorio-2026');
    const conteudo = screen.getByRole('complementary', { name: 'Conteúdo de relatorio-2026' });
    expect(conteudo.querySelector('pre').textContent).toBe('linha 1\nlinha 2 do relatório inteiro');
    expect(screen.getByRole('button', { name: 'Conteúdo' })).toBeInTheDocument();
  });

  it('Escape fecha os painéis', async () => {
    mockApi({ 'GET /cerebro': DADOS });
    renderizar(<Cerebro />);
    const user = await abrirPelaLista('relatorio-2026');
    expect(screen.getAllByRole('complementary')).toHaveLength(2);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('abrir um item com a Lista aberta fecha a Lista', async () => {
    mockApi({ 'GET /cerebro': DADOS });
    renderizar(<Cerebro />);
    await abrirPelaLista('Ana');
    expect(screen.queryByRole('region', { name: 'Lista do cérebro' })).not.toBeInTheDocument();
  });

  it('área sem pontos na Lista mostra "Nada aqui ainda"', async () => {
    mockApi({ 'GET /cerebro': DADOS });
    renderizar(<Cerebro />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Lista' }));
    const lista = screen.getByRole('region', { name: 'Lista do cérebro' });
    expect(within(lista).getAllByText('Nada aqui ainda')).toHaveLength(3);
  });

  it('Legenda abre e fecha', async () => {
    mockApi({ 'GET /cerebro': DADOS });
    renderizar(<Cerebro />);
    const user = userEvent.setup();
    const botao = await screen.findByRole('button', { name: 'Legenda' });
    expect(screen.queryByRole('list', { name: 'Legenda' })).not.toBeInTheDocument();
    await user.click(botao);
    expect(within(screen.getByRole('list', { name: 'Legenda' })).getByText('Pede ação')).toBeInTheDocument();
    await user.click(botao);
    expect(screen.queryByRole('list', { name: 'Legenda' })).not.toBeInTheDocument();
  });

  it('mostra os avisos da pasta e, sem pasta, o link das configurações', async () => {
    mockApi({ 'GET /cerebro': { ...DADOS, centro: null, avisos: ['rotinas.json inválido'] } });
    renderizar(<Cerebro />);
    expect(await screen.findByRole('alert')).toHaveTextContent('rotinas.json inválido');
    expect(screen.getByRole('link', { name: 'Configure a pasta do cérebro' })).toHaveAttribute('href', '/configuracoes');
  });
});
