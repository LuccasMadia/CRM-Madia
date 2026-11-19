import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TodoInicio } from './TodoInicio.jsx';
import { mockApi, resposta } from '../../test/mockApi.js';
import { renderizar } from '../../test/renderizar.jsx';

const tarefa = (extra = {}) => ({ id: 1, texto: 'Ligar', prazo: null, etapa: 'a_fazer', projeto_titulo: null, cliente_nome: null, dias_atraso: 0, link: '/tarefas', ...extra });
const lista = (itens, total = itens.length) => ({ total, itens });

describe('TodoInicio', () => {
  it('adiciona com Enter, limpa o campo e chama aoMudar', async () => {
    const { chamadas } = mockApi({ 'POST /tarefas': { id: 9 } });
    const aoMudar = vi.fn();
    renderizar(<TodoInicio tarefas={lista([])} aoMudar={aoMudar} />);
    const user = userEvent.setup();
    const campo = screen.getByLabelText('Nova tarefa');
    await user.type(campo, 'Pagar boleto{Enter}');
    await vi.waitFor(() => expect(aoMudar).toHaveBeenCalledTimes(1));
    expect(chamadas[0]).toMatchObject({ metodo: 'POST', caminho: '/tarefas', corpo: { texto: 'Pagar boleto' } });
    expect(campo).toHaveValue('');
  });

  it('texto vazio não envia', async () => {
    const { chamadas } = mockApi({});
    renderizar(<TodoInicio tarefas={lista([])} aoMudar={vi.fn()} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Nova tarefa'), '   ');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    expect(chamadas).toHaveLength(0);
  });

  it('erro ao criar mostra o aviso e mantém o texto', async () => {
    mockApi({ 'POST /tarefas': resposta(500, { erro: 'Falhou ao criar' }) });
    const aoMudar = vi.fn();
    renderizar(<TodoInicio tarefas={lista([])} aoMudar={aoMudar} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Nova tarefa'), 'Algo{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Falhou ao criar');
    expect(screen.getByLabelText('Nova tarefa')).toHaveValue('Algo');
    expect(aoMudar).not.toHaveBeenCalled();
  });

  it('concluir faz PUT com concluida true', async () => {
    const { chamadas } = mockApi({ 'PUT /tarefas/1': { id: 1 } });
    const aoMudar = vi.fn();
    renderizar(<TodoInicio tarefas={lista([tarefa()])} aoMudar={aoMudar} />);
    await userEvent.setup().click(screen.getByRole('checkbox', { name: 'Concluir: Ligar' }));
    await vi.waitFor(() => expect(aoMudar).toHaveBeenCalledTimes(1));
    expect(chamadas[0]).toMatchObject({ metodo: 'PUT', caminho: '/tarefas/1', corpo: { concluida: true } });
  });

  it('erro ao concluir mostra o aviso e mantém a linha', async () => {
    mockApi({ 'PUT /tarefas/1': resposta(500, { erro: 'Não deu' }) });
    const aoMudar = vi.fn();
    renderizar(<TodoInicio tarefas={lista([tarefa()])} aoMudar={aoMudar} />);
    await userEvent.setup().click(screen.getByRole('checkbox', { name: 'Concluir: Ligar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não deu');
    expect(screen.getByText('Ligar')).toBeInTheDocument();
    expect(aoMudar).not.toHaveBeenCalled();
  });

  it('mostra atrasada 3d e aguardando cliente', () => {
    renderizar(<TodoInicio tarefas={lista([tarefa({ dias_atraso: 3, etapa: 'aguardando_cliente', projeto_titulo: 'Site X', link: '/projetos/2' })])} aoMudar={vi.fn()} />);
    expect(screen.getByText('atrasada 3d')).toHaveClass('item-atrasado');
    expect(document.querySelector('.etiqueta--aguardando')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ligar' })).toHaveAttribute('href', '/projetos/2');
    expect(screen.getByText('Site X')).toBeInTheDocument();
  });

  it('Ver todas (18) quando há mais que os itens', () => {
    renderizar(<TodoInicio tarefas={lista([tarefa()], 18)} aoMudar={vi.fn()} />);
    expect(screen.getByRole('link', { name: 'Ver todas (18)' })).toHaveAttribute('href', '/tarefas');
  });

  it('Enter duas vezes seguidas cria só uma tarefa', async () => {
    const { chamadas } = mockApi({ 'POST /tarefas': { id: 9 } });
    renderizar(<TodoInicio tarefas={lista([])} aoMudar={vi.fn()} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Nova tarefa'), 'Uma{Enter}{Enter}');
    await vi.waitFor(() => expect(screen.getByLabelText('Nova tarefa')).toHaveValue(''));
    expect(chamadas.filter((c) => c.metodo === 'POST')).toHaveLength(1);
  });

  it('duplo clique na caixa faz só um PUT', async () => {
    const { chamadas } = mockApi({ 'PUT /tarefas/1': { id: 1 } });
    renderizar(<TodoInicio tarefas={lista([tarefa()])} aoMudar={vi.fn()} />);
    const caixa = screen.getByRole('checkbox', { name: 'Concluir: Ligar' });
    fireEvent.click(caixa);
    fireEvent.click(caixa); // síncrono: o primeiro PUT ainda está em andamento
    await vi.waitFor(() => expect(chamadas.length).toBeGreaterThan(0));
    expect(chamadas.filter((c) => c.metodo === 'PUT')).toHaveLength(1);
  });

  it('texto digitado durante o salvamento não é apagado', async () => {
    const aoMudar = vi.fn();
    mockApi({ 'POST /tarefas': () => { fireEvent.change(screen.getByLabelText('Nova tarefa'), { target: { value: 'Outra coisa' } }); return { id: 9 }; } });
    renderizar(<TodoInicio tarefas={lista([])} aoMudar={aoMudar} />);
    const campo = screen.getByLabelText('Nova tarefa');
    await userEvent.setup().type(campo, 'Primeira{Enter}');
    await vi.waitFor(() => expect(aoMudar).toHaveBeenCalledTimes(1));
    expect(campo).toHaveValue('Outra coisa');
  });

  it('botão Abrir Tarefas leva para a aba de tarefas', () => {
    renderizar(<TodoInicio tarefas={lista([])} aoMudar={vi.fn()} />);
    expect(screen.getByRole('link', { name: /Abrir Tarefas/ })).toHaveAttribute('href', '/tarefas');
  });
});
