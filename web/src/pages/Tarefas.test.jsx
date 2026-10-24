import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tarefas } from './Tarefas.jsx';
import { mockApi } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';
import { hojeISO } from '../lib/datas.js';

const dia = (n) => {
  const d = new Date(`${hojeISO()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const base = { prioridade: 'normal', tipo: 'site_sistema', prazo: null, checklist_total: 0, checklist_feitos: 0, comentarios_total: 0, tem_descricao: 0 };
const clientes = [{ id: 1, nome: 'Popy' }, { id: 2, nome: 'Rango do Bixo' }, { id: 12, nome: 'House Hamburgueria' }];
const todas = [
  { ...base, id: 10, projeto_id: 2, projeto_titulo: 'App Rango', cliente_id: 2, cliente_nome: 'Rango do Bixo', texto: 'Telas', etapa: 'fazendo', prazo: dia(-2) },
  { ...base, id: 11, projeto_id: 1, projeto_titulo: 'Site Popy', cliente_id: 1, cliente_nome: 'Popy', texto: 'Fotos', etapa: 'aguardando_cliente', etapa_desde: dia(-8) },
  { ...base, id: 12, projeto_id: 1, projeto_titulo: 'Site Popy', cliente_id: 1, cliente_nome: 'Popy', texto: 'Domínio', etapa: 'concluido', concluida_em: dia(-1) },
  { ...base, id: 13, projeto_id: null, cliente_id: 12, cliente_nome: 'House Hamburgueria', texto: 'Receber placa', etapa: 'a_fazer', tipo: 'cobranca', prioridade: 'urgente', prazo: dia(0) },
  { ...base, id: 14, projeto_id: null, cliente_id: null, texto: 'Testar repo', etapa: 'a_fazer', tipo: 'interno', prazo: dia(1) },
];
const rotas = (extra = {}) => ({ 'GET /clientes': clientes, 'GET /tarefas': todas, ...extra });
const abrir = (rota = '/tarefas') => renderizar(<Tarefas />, { rota, padrao: '/tarefas' });

beforeEach(() => {
  try { localStorage.clear(); } catch { /* sem armazenamento */ }
});

describe('Tarefas (quadro geral)', () => {
  it('mostra o quadro com empresa e projeto, internas marcadas e Concluído recolhido', async () => {
    mockApi(rotas());
    abrir();
    await screen.findByText('Telas');
    const fazendo = within(screen.getByRole('region', { name: 'Fazendo agora' }));
    expect(fazendo.getByRole('link', { name: 'App Rango' })).toHaveAttribute('href', '/projetos/2?aba=tarefas');
    expect(fazendo.getByText('Rango do Bixo')).toHaveClass('etiqueta--empresa');
    expect(fazendo.getByText('Rango do Bixo').style.getPropertyValue('--cor')).toMatch(/^var\(--tag-/);
    // só a empresa, sem projeto
    const fazer = within(screen.getByRole('region', { name: 'A fazer' }));
    expect(fazer.getByText('House Hamburgueria')).toHaveClass('etiqueta--empresa');
    expect(within(screen.getByRole('button', { name: 'Testar repo' }).closest('article')).getByText('Interna')).toHaveClass('etiqueta--voce');
    expect(screen.queryByText('Domínio')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Mostrar' }));
    expect(screen.getByText('Domínio')).toBeInTheDocument();
  });

  it('faixa Pede atenção: atrasadas, urgentes, vencem hoje e aguardando há mais de 5 dias, cada uma com seu recorte', async () => {
    mockApi(rotas());
    abrir();
    const faixa = within(await screen.findByRole('region', { name: 'Pede atenção' }));
    expect(faixa.getByRole('link', { name: '1 tarefa atrasada' })).toHaveAttribute('href', '/tarefas?foco=atrasadas&ver=lista');
    expect(faixa.getByRole('link', { name: '1 urgente aberta' })).toHaveAttribute('href', '/tarefas?foco=urgentes&ver=quadro');
    expect(faixa.getByRole('link', { name: '1 vence hoje' })).toHaveAttribute('href', '/tarefas?foco=hoje&ver=lista');
    expect(faixa.getByRole('link', { name: '1 aguardando cliente há mais de 5 dias' })).toHaveAttribute('href', '/tarefas?foco=aguardando&ver=quadro');
    expect(faixa.getByRole('link', { name: '1 tarefa atrasada' })).toHaveClass('pede-atencao__item--perigo');
  });

  it('o recorte da faixa mostra só aquelas tarefas, na visão certa, e dá para limpar', async () => {
    mockApi(rotas());
    abrir('/tarefas?foco=atrasadas&ver=lista');
    const user = userEvent.setup();
    expect(await screen.findByRole('region', { name: 'Atrasadas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Telas' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Testar repo' })).toBeNull();
    expect(screen.getByText(/Mostrando: atrasadas/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(await screen.findByRole('button', { name: 'Testar repo' })).toBeInTheDocument();
  });

  it('visão Lista agrupa por prazo, conclui pelo checkbox e é lembrada', async () => {
    const { chamadas } = mockApi(rotas({ 'PUT /tarefas/14': {} }));
    abrir();
    const user = userEvent.setup();
    await screen.findByText('Telas');
    await user.click(screen.getByRole('button', { name: 'Lista' }));
    const grupos = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label')).filter((n) => n !== 'Pede atenção');
    expect(grupos).toEqual(['Atrasadas', 'Hoje', 'Amanhã', 'Sem prazo', 'Concluídas']);
    expect(within(screen.getByRole('region', { name: 'Hoje' })).getByText('Urgente')).toHaveClass('prioridade--urgente');
    expect(within(screen.getByRole('region', { name: 'Atrasadas' })).getByText(/^\d{2}\/\d{2}/)).toHaveClass('item-atrasado');
    // Concluídas recolhidas
    expect(screen.queryByRole('button', { name: 'Domínio' })).toBeNull();
    await user.click(screen.getByLabelText('Concluir Testar repo'));
    await waitFor(() => expect(chamadas.filter((c) => c.metodo === 'PUT')).toEqual([{ metodo: 'PUT', caminho: '/tarefas/14', corpo: { concluida: true } }]));
    expect(localStorage.getItem('crm.tarefasVisao')).toBe('lista');
  });

  it('filtros em pílulas e por empresa vão para o endereço e para a consulta', async () => {
    const { chamadas } = mockApi(rotas({
      'GET /tarefas?tipo=cobranca': [todas[3]],
      'GET /tarefas?cliente_id=12&tipo=cobranca': [todas[3]],
      'GET /tarefas?cliente_id=12&tipo=cobranca&prioridade=urgente': [todas[3]],
      'GET /tarefas?cliente_id=12&prioridade=urgente': [todas[3]],
      'GET /tarefas?tipo=interno': [todas[4]],
    }));
    abrir();
    const user = userEvent.setup();
    await screen.findByText('Telas');
    await user.click(screen.getByRole('button', { name: 'Cobrança' }));
    await waitFor(() => expect(screen.queryByText('Telas')).toBeNull());
    await user.selectOptions(screen.getByLabelText('Filtrar por empresa'), 'House Hamburgueria');
    await user.click(screen.getByRole('button', { name: 'Urgente' }));
    // clicar de novo na pílula ativa tira o filtro
    await user.click(screen.getByRole('button', { name: 'Cobrança' }));
    await user.click(screen.getByRole('button', { name: 'Internas' }));
    const consultas = chamadas.filter((c) => c.caminho.startsWith('/tarefas')).map((c) => c.caminho);
    expect(consultas).toEqual([
      '/tarefas', '/tarefas?tipo=cobranca', '/tarefas?cliente_id=12&tipo=cobranca',
      '/tarefas?cliente_id=12&tipo=cobranca&prioridade=urgente', '/tarefas?cliente_id=12&prioridade=urgente',
      '/tarefas?cliente_id=12&tipo=interno&prioridade=urgente',
    ]);
  });

  it('barra "+ Nova tarefa": Enter cria sem empresa (interna) e dá para abrir a criada', async () => {
    const { chamadas } = mockApi(rotas({ 'POST /tarefas': { id: 20, texto: 'Organizar backup' }, 'GET /tarefas/20': { ...base, id: 20, texto: 'Organizar backup', etapa: 'a_fazer', tipo: 'interno', checklist: [], comentarios: [], criado_em: '2026-10-24T10:00:00Z' } }));
    abrir();
    const user = userEvent.setup();
    await screen.findByText('Telas');
    // o formulário de baixo não existe mais
    expect(screen.queryByRole('button', { name: 'Adicionar' })).toBeNull();
    await user.type(screen.getByLabelText('Nova tarefa'), 'Organizar backup{Enter}');
    await waitFor(() => expect(chamadas.filter((c) => c.metodo === 'POST')).toEqual([
      { metodo: 'POST', caminho: '/tarefas', corpo: { texto: 'Organizar backup' } },
    ]));
    expect(screen.getByLabelText('Nova tarefa')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Abrir para detalhar' }));
    expect(await screen.findByRole('dialog', { name: 'Tarefa: Organizar backup' })).toBeInTheDocument();
  });

  it('a barra começa pela empresa e pelo tipo do filtro, e o que for escolhido nela vale', async () => {
    const { chamadas } = mockApi(rotas({
      'GET /tarefas?cliente_id=12&tipo=cobranca': [todas[3]],
      'POST /tarefas': { id: 21, texto: 'Cobrar House' },
    }));
    abrir('/tarefas?cliente=12&tipo=cobranca');
    const user = userEvent.setup();
    await screen.findByText('Receber placa');
    await waitFor(() => expect(screen.getByLabelText('Empresa da nova tarefa')).toHaveDisplayValue('House Hamburgueria'));
    expect(screen.getByLabelText('Tipo da nova tarefa')).toHaveDisplayValue('Cobrança');
    await user.type(screen.getByLabelText('Prazo da nova tarefa'), '2026-11-05');
    await user.type(screen.getByLabelText('Nova tarefa'), 'Cobrar House{Enter}');
    await waitFor(() => expect(chamadas.find((c) => c.metodo === 'POST')?.corpo).toEqual({
      texto: 'Cobrar House', prazo: '2026-11-05', cliente_id: 12, tipo: 'cobranca',
    }));
  });

  it('com o filtro de um projeto (link antigo), cria no projeto', async () => {
    const { chamadas } = mockApi(rotas({ 'GET /tarefas?projeto_id=1': [todas[1]], 'POST /projetos/1/tarefas': { id: 22, texto: 'Textos' } }));
    abrir('/tarefas?projeto=1');
    const user = userEvent.setup();
    await screen.findByText('Fotos');
    expect(screen.queryByLabelText('Empresa da nova tarefa')).toBeNull();
    await user.type(screen.getByLabelText('Nova tarefa'), 'Textos{Enter}');
    await waitFor(() => expect(chamadas.filter((c) => c.metodo === 'POST').map((c) => c.caminho)).toEqual(['/projetos/1/tarefas']));
  });
});
