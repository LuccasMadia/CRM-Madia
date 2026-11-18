import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { ResumoDia } from './ResumoDia.jsx';
import { Numero } from '../../components/Numero.jsx';
import { renderizar } from '../../test/renderizar.jsx';

const vazio = { orcamentos: [], projetos: [], aguardando: [] };
const props = (extra = {}) => ({ followUps: vazio, paraEntregar: { gmn: 0, placas: 0, itens: [] }, divulgacao: [], ...extra });

describe('ResumoDia', () => {
  it('mostra os títulos na ordem', () => {
    renderizar(<ResumoDia {...props()} />);
    const titulos = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(titulos).toEqual(['Follow-ups', 'Para entregar', 'Divulgação', 'Agenda']);
  });

  it('follow-ups vazios mostram Ninguém esperando por você.', () => {
    renderizar(<ResumoDia {...props()} />);
    expect(screen.getByText('Ninguém esperando por você.')).toBeInTheDocument();
  });

  it('mostra follow-ups e entregas com links', () => {
    renderizar(<ResumoDia {...props({
      followUps: {
        orcamentos: [{ id: 1, cliente_nome: 'Ana', dias: 5, link: '/clientes/1' }],
        projetos: [{ id: 2, titulo: 'Site', cliente_nome: 'Bia', dias: 9, link: '/projetos/2' }],
        aguardando: [],
      },
      paraEntregar: { gmn: 1, placas: 0, itens: [{ projeto_id: 7, cliente_id: 4, cliente_nome: 'Caio', servico: 'google_meu_negocio' }] },
    })} />);
    expect(screen.getByRole('link', { name: 'Orçamento · Ana · enviado há 5 d' })).toHaveAttribute('href', '/clientes/1');
    expect(screen.getByRole('link', { name: 'Site · Bia · parado há 9 d' })).toHaveAttribute('href', '/projetos/2');
    expect(screen.getByRole('link', { name: 'Caio' }).getAttribute('href')).toMatch(/^\/clientes\/4\?aba=/);
  });

  it('Sem cliente vai para /tarefas', () => {
    renderizar(<ResumoDia {...props({ followUps: { ...vazio, aguardando: [{ cliente_id: null, cliente_nome: 'Sem cliente', quantidade: 1, link: '/tarefas' }] } })} />);
    expect(screen.getByRole('link', { name: 'Sem cliente · 1 tarefa aguardando' })).toHaveAttribute('href', '/tarefas');
  });

  it('agenda reservada aparece', () => {
    renderizar(<ResumoDia {...props()} />);
    expect(screen.getByText('Agenda do dia — em breve (Google Agenda)')).toBeInTheDocument();
  });
});

describe('Numero com para', () => {
  it('vira link com o href', () => {
    renderizar(<Numero rotulo="Vencido" icone="funil" para="/financeiro">3</Numero>);
    expect(screen.getByRole('link', { name: /Vencido/ })).toHaveAttribute('href', '/financeiro');
  });
});
