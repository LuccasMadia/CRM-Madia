import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { TodoInicio } from './TodoInicio.jsx';
import { renderizar } from '../../test/renderizar.jsx';

const tarefa = (extra = {}) => ({ id: 1, texto: 'Ligar', prazo: null, etapa: 'a_fazer', projeto_titulo: null, cliente_nome: null, dias_atraso: 0, link: '/tarefas', ...extra });
const lista = (itens, total = itens.length) => ({ total, itens });

describe('TodoInicio', () => {
  it('é só visualização: sem campo de nova tarefa nem caixa de concluir', () => {
    renderizar(<TodoInicio tarefas={lista([tarefa()])} />);
    expect(screen.getByText('Ligar')).toBeInTheDocument();
    expect(screen.queryByLabelText('Nova tarefa')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('mostra atrasada 3d e aguardando cliente', () => {
    renderizar(<TodoInicio tarefas={lista([tarefa({ dias_atraso: 3, etapa: 'aguardando_cliente', projeto_titulo: 'Site X', link: '/projetos/2' })])} />);
    expect(screen.getByText('atrasada 3d')).toHaveClass('item-atrasado');
    expect(document.querySelector('.etiqueta--aguardando')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ligar' })).toHaveAttribute('href', '/projetos/2');
    expect(screen.getByText('Site X')).toBeInTheDocument();
  });

  it('Ver todas (18) quando há mais que os itens', () => {
    renderizar(<TodoInicio tarefas={lista([tarefa()], 18)} />);
    expect(screen.getByRole('link', { name: 'Ver todas (18)' })).toHaveAttribute('href', '/tarefas');
  });

  it('botão Abrir Tarefas leva para a aba de tarefas', () => {
    renderizar(<TodoInicio tarefas={lista([])} />);
    expect(screen.getByRole('link', { name: /Abrir Tarefas/ })).toHaveAttribute('href', '/tarefas');
    expect(screen.getByText('Nenhuma tarefa aberta.')).toBeInTheDocument();
  });
});
