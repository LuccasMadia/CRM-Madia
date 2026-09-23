import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AbaTarefas } from './AbaTarefas.jsx';
import { mockApi } from '../../test/mockApi.js';

const tarefas = [
  { id: 1, texto: 'Briefing', prazo: null, concluida: 1 },
  { id: 2, texto: 'Layout', prazo: '2026-10-01', concluida: 0 },
];

describe('AbaTarefas', () => {
  it('adiciona, conclui e reordena', async () => {
    const { chamadas } = mockApi({
      'GET /projetos/5/tarefas': tarefas,
      'POST /projetos/5/tarefas': { id: 3 },
      'PUT /tarefas/2': {},
      'PUT /projetos/5/tarefas/ordem': [],
    });
    render(<AbaTarefas projetoId={5} />);
    const user = userEvent.setup();
    expect(await screen.findByLabelText('Briefing')).toBeChecked();

    await user.click(screen.getByLabelText('Layout'));
    await user.click(screen.getByRole('button', { name: 'Mover Layout para cima' }));
    await user.type(screen.getByLabelText('Nova tarefa'), 'Deploy');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));

    await screen.findByLabelText('Briefing');
    const escritas = chamadas.filter((c) => c.metodo !== 'GET').map((c) => [c.metodo, c.caminho, c.corpo]);
    expect(escritas).toEqual([
      ['PUT', '/tarefas/2', { concluida: true }],
      ['PUT', '/projetos/5/tarefas/ordem', { ids: [2, 1] }],
      ['POST', '/projetos/5/tarefas', { texto: 'Deploy', prazo: '' }],
    ]);
  });
});
