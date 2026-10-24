import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { AbaTarefas } from './AbaTarefas.jsx';
import { mockApi } from '../../test/mockApi.js';

const tarefas = [
  { id: 1, texto: 'Briefing', prazo: null, concluida: 1, etapa: 'concluido' },
  { id: 2, texto: 'Layout', prazo: '2026-10-01', concluida: 0, etapa: 'a_fazer' },
  { id: 3, texto: 'Logo', prazo: null, concluida: 0, etapa: 'aguardando_cliente' },
];

const renderizar = () => render(<MemoryRouter><AbaTarefas projetoId={5} /></MemoryRouter>);
const coluna = (nome) => within(screen.getByRole('region', { name: nome }));

describe('AbaTarefas', () => {
  it('mostra as 4 colunas com cada tarefa na sua', async () => {
    mockApi({ 'GET /projetos/5/tarefas': tarefas });
    renderizar();
    await screen.findByText('Layout');
    expect(coluna('A fazer').getByText('Layout')).toBeInTheDocument();
    expect(coluna('Fazendo agora').queryAllByRole('article')).toHaveLength(0);
    expect(coluna('Aguardando cliente').getByText('Logo')).toBeInTheDocument();
    expect(coluna('Concluído').getByText('Briefing')).toHaveClass('tarefa__texto--feita');
    // prazo vencido fica vermelho enquanto a tarefa não estiver concluída
    expect(coluna('A fazer').getByText(/^01\/10(\/2026)? · atrasada$/)).toHaveClass('item-atrasado');
  });

  it('move pelo menu, sobe e adiciona; o cartão não tem mais o excluir', async () => {
    const { chamadas } = mockApi({
      'GET /projetos/5/tarefas': tarefas,
      'POST /projetos/5/tarefas': { id: 4 },
      'PUT /tarefas/2': {},
      'PUT /tarefas/3/posicao': {},
    });
    renderizar();
    const user = userEvent.setup();
    await screen.findByText('Layout');

    await user.selectOptions(screen.getByRole('combobox', { name: 'Mover Layout' }), 'Fazendo agora');
    await user.click(screen.getByRole('button', { name: 'Mover Logo para cima' }));
    expect(screen.queryByRole('button', { name: 'Excluir Briefing' })).toBeNull();
    // a barra do topo cria já no projeto, sem perguntar a empresa
    expect(screen.queryByLabelText('Empresa da nova tarefa')).toBeNull();
    await user.type(screen.getByLabelText('Nova tarefa'), 'Deploy{Enter}');

    await waitFor(() => expect(chamadas.some((c) => c.metodo === 'POST')).toBe(true));
    const escritas = chamadas.filter((c) => c.metodo !== 'GET').map((c) => [c.metodo, c.caminho, c.corpo]);
    expect(escritas).toEqual([
      ['PUT', '/tarefas/2', { etapa: 'fazendo' }],
      ['PUT', '/tarefas/3/posicao', { direcao: 'cima' }],
      ['POST', '/projetos/5/tarefas', { texto: 'Deploy' }],
    ]);
  });

  it('arrastar o cartão para outra coluna muda a etapa', async () => {
    const { chamadas } = mockApi({ 'GET /projetos/5/tarefas': tarefas, 'PUT /tarefas/3': {} });
    renderizar();
    const cartao = (await screen.findByText('Logo')).closest('article');
    const dados = {};
    const dataTransfer = { setData: (k, v) => { dados[k] = v; }, getData: (k) => dados[k] };
    fireEvent.dragStart(cartao, { dataTransfer });
    fireEvent.drop(screen.getByRole('region', { name: 'Concluído' }), { dataTransfer });
    await waitFor(() => expect(chamadas.filter((c) => c.metodo === 'PUT')).toEqual([
      { metodo: 'PUT', caminho: '/tarefas/3', corpo: { etapa: 'concluido' } },
    ]));
  });

  it('mostra aviso quando não há tarefas', async () => {
    mockApi({ 'GET /projetos/5/tarefas': [] });
    renderizar();
    expect(await screen.findByText('Nenhuma tarefa ainda.')).toBeInTheDocument();
  });
});
