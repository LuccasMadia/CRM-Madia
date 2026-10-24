import { describe, it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tarefas } from '../../pages/Tarefas.jsx';
import { mockApi } from '../../test/mockApi.js';
import { renderizar } from '../../test/renderizar.jsx';

const tarefa = {
  id: 11, projeto_id: 1, projeto_titulo: 'Cardápio digital', cliente_id: 9, cliente_nome: 'Filinto Sorvetes',
  texto: 'Definir funções do admin com o cliente', descricao: 'Roteiro em https://exemplo.com/roteiro. Ver depois.',
  tipo: 'site_sistema', prioridade: 'alta', prazo: null, etapa: 'a_fazer', etapa_desde: '2026-10-14',
  criado_em: '2026-10-14T13:00:00.000Z', concluida_em: null, atualizado_em: '2026-10-14T13:00:00.000Z',
  checklist_total: 2, checklist_feitos: 1, comentarios_total: 1, tem_descricao: 1,
  checklist: [
    { id: 1, texto: 'Pedidos', feito: 1, ordem: 0 },
    { id: 2, texto: 'Estoque', feito: 0, ordem: 1 },
  ],
  comentarios: [{ id: 7, texto: 'Mandei a lista por WhatsApp', criado_em: '2026-10-15T12:30:00.000Z' }],
};
const rotas = (extra = {}) => ({
  'GET /projetos': [],
  'GET /tarefas': [tarefa],
  'GET /tarefas/11': tarefa,
  'GET /clientes': [{ id: 9, nome: 'Filinto Sorvetes' }, { id: 3, nome: 'House Hamburgueria' }],
  'GET /projetos?cliente_id=9': [{ id: 1, titulo: 'Cardápio digital', etapa: 'andamento' }, { id: 2, titulo: 'Antigo', etapa: 'perdido' }],
  ...extra,
});
const abrir = (rota = '/tarefas?tarefa=11') => renderizar(<Tarefas />, { rota, padrao: '/tarefas' });
const painel = async () => within(await screen.findByRole('dialog', { name: `Tarefa: ${tarefa.texto}` }));

describe('Painel lateral da tarefa', () => {
  it('abre pelo endereço e mostra tudo da tarefa, com links clicáveis na descrição', async () => {
    mockApi(rotas());
    abrir();
    const p = await painel();
    expect(p.getByLabelText('Título da tarefa')).toHaveValue(tarefa.texto);
    expect(p.getByLabelText('Etapa')).toHaveDisplayValue('A fazer');
    expect(p.getByLabelText('Prioridade')).toHaveDisplayValue('Alta');
    expect(p.getByLabelText('Tipo')).toHaveDisplayValue('Site/Sistema');
    await waitFor(() => expect(p.getByLabelText('Empresa')).toHaveDisplayValue('Filinto Sorvetes'));
    await waitFor(() => expect(p.getByLabelText('Projeto')).toHaveDisplayValue('Cardápio digital'));
    // projeto perdido não aparece para escolher
    expect(within(p.getByLabelText('Projeto')).queryByText('Antigo')).toBeNull();
    expect(p.getByRole('link', { name: 'https://exemplo.com/roteiro' })).toHaveAttribute('href', 'https://exemplo.com/roteiro');
    expect(p.getByRole('progressbar', { name: 'Progresso do checklist' })).toHaveAttribute('aria-valuenow', '1');
    expect(p.getByText('1/2')).toBeInTheDocument();
    expect(p.getByText('Mandei a lista por WhatsApp')).toBeInTheDocument();
    expect(p.getByText(/Criada em 14\/10\/2026/)).toBeInTheDocument();
  });

  it('clicar no cartão abre o painel e Esc fecha', async () => {
    mockApi(rotas());
    abrir('/tarefas');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: tarefa.texto }));
    await painel();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('clicar fora fecha', async () => {
    mockApi(rotas());
    abrir();
    const user = userEvent.setup();
    await painel();
    await user.click(document.querySelector('.painel-lateral__fundo'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('edita título, etapa, prioridade, tipo, empresa e prazo na hora', async () => {
    const { chamadas } = mockApi(rotas({ 'PUT /tarefas/11': tarefa }));
    abrir();
    const user = userEvent.setup();
    const p = await painel();
    const titulo = p.getByLabelText('Título da tarefa');
    await user.clear(titulo);
    await user.type(titulo, 'Definir admin{Enter}');
    await user.selectOptions(p.getByLabelText('Etapa'), 'Aguardando cliente');
    await user.selectOptions(p.getByLabelText('Prioridade'), 'Urgente');
    await user.selectOptions(p.getByLabelText('Tipo'), 'Cobrança');
    await waitFor(() => expect(p.getByLabelText('Empresa')).toHaveDisplayValue('Filinto Sorvetes'));
    await user.selectOptions(p.getByLabelText('Empresa'), 'House Hamburgueria');
    await waitFor(() => expect(chamadas.filter((c) => c.metodo === 'PUT')).toHaveLength(5));
    expect(chamadas.filter((c) => c.metodo === 'PUT').map((c) => c.corpo)).toEqual([
      { texto: 'Definir admin' },
      { etapa: 'aguardando_cliente' },
      { prioridade: 'urgente' },
      { tipo: 'cobranca' },
      { cliente_id: 3 },
    ]);
  });

  it('checklist: adiciona, marca e apaga; comentários: comenta e apaga com confirmação', async () => {
    const { chamadas } = mockApi(rotas({
      'POST /tarefas/11/checklist': { id: 3 },
      'PUT /tarefas/checklist/2': {},
      'DELETE /tarefas/checklist/1': null,
      'POST /tarefas/11/comentarios': { id: 8 },
      'DELETE /tarefas/comentarios/7': null,
    }));
    abrir();
    const user = userEvent.setup();
    const p = await painel();
    await user.type(p.getByLabelText('Novo item do checklist'), 'Relatórios{Enter}');
    await user.click(p.getByLabelText('Feito: Estoque'));
    await user.click(p.getByRole('button', { name: 'Apagar Pedidos' }));
    await user.type(p.getByLabelText('Novo comentário'), 'Cliente respondeu');
    await user.click(p.getByRole('button', { name: 'Comentar' }));
    await user.click(p.getByRole('button', { name: 'Apagar comentário' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Apagar comentário?' })).getByRole('button', { name: 'Apagar' }));

    await waitFor(() => expect(chamadas.some((c) => c.caminho === '/tarefas/comentarios/7')).toBe(true));
    expect(chamadas.filter((c) => c.metodo !== 'GET').map((c) => [c.metodo, c.caminho, c.corpo])).toEqual([
      ['POST', '/tarefas/11/checklist', { texto: 'Relatórios' }],
      ['PUT', '/tarefas/checklist/2', { feito: true }],
      ['DELETE', '/tarefas/checklist/1', undefined],
      ['POST', '/tarefas/11/comentarios', { texto: 'Cliente respondeu' }],
      ['DELETE', '/tarefas/comentarios/7', undefined],
    ]);
  });

  it('excluir pede confirmação e fecha o painel', async () => {
    const { chamadas } = mockApi(rotas({ 'DELETE /tarefas/11': null }));
    abrir();
    const user = userEvent.setup();
    const p = await painel();
    await user.click(p.getByRole('button', { name: 'Excluir tarefa' }));
    expect(chamadas.some((c) => c.metodo === 'DELETE')).toBe(false);
    await user.click(within(screen.getByRole('dialog', { name: 'Excluir tarefa?' })).getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(chamadas.filter((c) => c.metodo === 'DELETE').map((c) => c.caminho)).toEqual(['/tarefas/11']);
  });
});
