import { describe, it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tarefas } from './Tarefas.jsx';
import { mockApi } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';

const projetos = [
  { id: 1, titulo: 'Site Popy', etapa: 'andamento' },
  { id: 2, titulo: 'App Rango', etapa: 'prototipo' },
  { id: 3, titulo: 'Perdido', etapa: 'perdido' },
];
const todas = [
  { id: 10, projeto_id: 2, projeto_titulo: 'App Rango', cliente_id: 2, cliente_nome: 'Rango do Bixo', texto: 'Telas', prazo: null, etapa: 'fazendo' },
  { id: 11, projeto_id: 1, projeto_titulo: 'Site Popy', cliente_id: 1, cliente_nome: 'Popy', texto: 'Fotos', prazo: null, etapa: 'aguardando_cliente' },
  { id: 12, projeto_id: 1, projeto_titulo: 'Site Popy', cliente_id: 1, cliente_nome: 'Popy', texto: 'Domínio', prazo: null, etapa: 'concluido' },
];
const abrir = () => renderizar(<Tarefas />, { rota: '/tarefas', padrao: '/tarefas' });

describe('Tarefas (quadro geral)', () => {
  it('mostra tarefas de todos os projetos com o nome do projeto e Concluído recolhido', async () => {
    mockApi({ 'GET /projetos': projetos, 'GET /tarefas': todas });
    abrir();
    await screen.findByText('Telas');
    const fazendo = within(screen.getByRole('region', { name: 'Fazendo agora' }));
    expect(fazendo.getByRole('link', { name: 'App Rango' })).toHaveAttribute('href', '/projetos/2?aba=tarefas');
    // a empresa aparece como etiqueta para identificar o cartão de relance
    expect(fazendo.getByText('Rango do Bixo')).toHaveClass('etiqueta--empresa');
    expect(fazendo.getByText('Rango do Bixo').style.getPropertyValue('--cor')).toMatch(/^var\(--tag-/);
    expect(screen.queryByText('Domínio')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Mostrar' }));
    expect(screen.getByText('Domínio')).toBeInTheDocument();
    // projetos perdidos não entram no filtro
    expect(within(document.getElementById('filtro-projeto')).queryByText('Perdido')).not.toBeInTheDocument();
  });

  it('filtra por projeto e cria a tarefa no projeto filtrado', async () => {
    const { chamadas } = mockApi({
      'GET /projetos': projetos,
      'GET /tarefas': todas,
      'GET /tarefas?projeto_id=1': todas.filter((t) => t.projeto_id === 1),
      'POST /projetos/1/tarefas': { id: 13 },
    });
    abrir();
    const user = userEvent.setup();
    await screen.findByText('Telas');

    await user.selectOptions(document.getElementById('filtro-projeto'), 'Site Popy');
    await waitFor(() => expect(screen.queryByText('Telas')).not.toBeInTheDocument());
    expect(screen.getByText('Fotos')).toBeInTheDocument();
    // com filtro, o cartão não repete o nome do projeto
    expect(screen.queryByRole('link', { name: 'Site Popy' })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Nova tarefa'), 'Textos');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    await waitFor(() => expect(chamadas.filter((c) => c.metodo === 'POST')).toEqual([
      { metodo: 'POST', caminho: '/projetos/1/tarefas', corpo: { texto: 'Textos', prazo: '' } },
    ]));
  });

  it('sem filtro, a tarefa nova nasce interna (sem projeto)', async () => {
    const { chamadas } = mockApi({ 'GET /projetos': projetos, 'GET /tarefas': [], 'POST /tarefas': { id: 20 } });
    abrir();
    const user = userEvent.setup();
    expect(await screen.findByText('Nenhuma tarefa por aqui.')).toBeInTheDocument();
    expect(screen.getByLabelText('Projeto', { selector: '#campo-projeto_id' })).toHaveDisplayValue('Sem projeto (interna)');
    await user.type(screen.getByLabelText('Nova tarefa'), 'Testar repo');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    await waitFor(() => expect(chamadas.filter((c) => c.metodo === 'POST')).toEqual([
      { metodo: 'POST', caminho: '/tarefas', corpo: { texto: 'Testar repo', prazo: '' } },
    ]));
  });

  it('com filtro num projeto dá para trocar para "Sem projeto" na hora de criar', async () => {
    const { chamadas } = mockApi({
      'GET /projetos': projetos,
      'GET /tarefas?projeto_id=1': [],
      'POST /tarefas': { id: 21 },
    });
    renderizar(<Tarefas />, { rota: '/tarefas?projeto=1', padrao: '/tarefas' });
    const user = userEvent.setup();
    await screen.findByText('Nenhuma tarefa por aqui.');
    const projeto = screen.getByLabelText('Projeto', { selector: '#campo-projeto_id' });
    await waitFor(() => expect(projeto).toHaveDisplayValue('Site Popy'));
    await user.selectOptions(projeto, 'Sem projeto (interna)');
    await user.type(screen.getByLabelText('Nova tarefa'), 'Organizar backup');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    await waitFor(() => expect(chamadas.filter((c) => c.metodo === 'POST').map((c) => c.caminho)).toEqual(['/tarefas']));
  });

  it('marca as internas com a etiqueta "Interna" e filtra só por elas', async () => {
    const interna = { id: 30, projeto_id: null, projeto_titulo: null, cliente_id: null, cliente_nome: null, texto: 'Testar repo', prazo: null, etapa: 'a_fazer' };
    mockApi({
      'GET /projetos': projetos,
      'GET /tarefas': [...todas, interna],
      'GET /tarefas?sem_projeto=1': [interna],
    });
    abrir();
    const user = userEvent.setup();
    const cartao = (await screen.findByText('Testar repo')).closest('article');
    expect(within(cartao).getByText('Interna')).toHaveClass('etiqueta--voce');
    expect(within(cartao).queryByRole('link')).not.toBeInTheDocument();

    await user.selectOptions(document.getElementById('filtro-projeto'), 'Sem projeto (internas)');
    await waitFor(() => expect(screen.queryByText('Telas')).not.toBeInTheDocument());
    expect(screen.getByText('Testar repo')).toBeInTheDocument();
  });
});
