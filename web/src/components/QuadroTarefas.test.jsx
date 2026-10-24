import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { QuadroTarefas } from './QuadroTarefas.jsx';
import { hojeISO } from '../lib/datas.js';
import { partesComLinks } from '../lib/tarefas.js';

const diasAtras = (n) => {
  const d = new Date(`${hojeISO()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const base = { prazo: null, etapa: 'a_fazer', prioridade: 'normal', tipo: 'interno', checklist_total: 0, checklist_feitos: 0, comentarios_total: 0, tem_descricao: 0 };

function montar(tarefas, props = {}) {
  const onAbrir = vi.fn();
  render(<MemoryRouter><QuadroTarefas tarefas={tarefas} onMudou={() => {}} onAbrir={onAbrir} mostrarProjeto {...props} /></MemoryRouter>);
  return onAbrir;
}
const cartao = (texto) => within(screen.getByRole('button', { name: texto }).closest('article'));

describe('Cartão de tarefa', () => {
  it('mostra empresa (mesmo sem projeto), projeto, tipo, prioridade, prazo, checklist, descrição e comentários', () => {
    montar([
      { ...base, id: 1, texto: 'Cobrar placa', cliente_id: 3, cliente_nome: 'House', projeto_id: null, tipo: 'cobranca', prioridade: 'urgente', prazo: diasAtras(2), checklist_total: 5, checklist_feitos: 2, tem_descricao: 1, comentarios_total: 3 },
      { ...base, id: 2, texto: 'Wireframe', cliente_id: 5, cliente_nome: 'Pingou', projeto_id: 9, projeto_titulo: 'Sorveteria Pingou', tipo: 'site_sistema', prioridade: 'baixa' },
      { ...base, id: 3, texto: 'Testar repo', cliente_id: null, projeto_id: null },
    ]);
    const cobrar = cartao('Cobrar placa');
    expect(cobrar.getByText('House')).toHaveClass('etiqueta--empresa');
    expect(cobrar.getByRole('img', { name: 'Cobrança' })).toBeInTheDocument();
    expect(cobrar.getByText('Urgente')).toHaveClass('prioridade--urgente');
    expect(cobrar.getByText(/· atrasada$/)).toHaveClass('item-atrasado');
    expect(cobrar.getByLabelText('Checklist 2 de 5')).toHaveTextContent('2/5');
    expect(cobrar.getByRole('img', { name: 'Tem descrição' })).toBeInTheDocument();
    expect(cobrar.getByLabelText('3 comentários')).toBeInTheDocument();

    const wire = cartao('Wireframe');
    expect(wire.getByRole('link', { name: 'Sorveteria Pingou' })).toHaveAttribute('href', '/projetos/9?aba=tarefas');
    expect(wire.getByText('Baixa')).toHaveClass('prioridade--baixa');
    expect(wire.queryByText('Normal')).toBeNull();

    expect(cartao('Testar repo').getByText('Interna')).toHaveClass('etiqueta--voce');
  });

  it('em Aguardando cliente mostra há quantos dias, em destaque depois de 5', () => {
    montar([
      { ...base, id: 1, texto: 'Fotos', cliente_id: 1, cliente_nome: 'A', etapa: 'aguardando_cliente', etapa_desde: diasAtras(8) },
      { ...base, id: 2, texto: 'Textos', cliente_id: 1, cliente_nome: 'A', etapa: 'aguardando_cliente', etapa_desde: diasAtras(1) },
    ]);
    expect(cartao('Fotos').getByText('há 8 dias').closest('.tarefa__info')).toHaveClass('tarefa__info--atencao');
    expect(cartao('Textos').getByText('há 1 dia').closest('.tarefa__info')).not.toHaveClass('tarefa__info--atencao');
  });

  it('clicar no cartão abre a tarefa; o link do projeto não', async () => {
    const onAbrir = montar([{ ...base, id: 2, texto: 'Wireframe', cliente_id: 5, cliente_nome: 'Pingou', projeto_id: 9, projeto_titulo: 'Sorveteria Pingou' }]);
    const user = userEvent.setup();
    await user.click(cartao('Wireframe').getByText('Pingou'));
    expect(onAbrir).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Wireframe' }));
    expect(onAbrir).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole('link', { name: 'Sorveteria Pingou' }));
    expect(onAbrir).toHaveBeenCalledTimes(2);
  });
});

describe('partesComLinks', () => {
  it('separa os links do texto, sem levar a pontuação da frase', () => {
    expect(partesComLinks('Veja https://a.com/x. e www.b.com, ok')).toEqual([
      { texto: 'Veja ' }, { texto: 'https://a.com/x', link: 'https://a.com/x' }, { texto: '. e ' },
      { texto: 'www.b.com', link: 'https://www.b.com' }, { texto: ', ok' },
    ]);
    expect(partesComLinks(null)).toEqual([]);
  });
});
