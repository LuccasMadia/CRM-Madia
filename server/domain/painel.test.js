import { describe, it, expect } from 'vitest';
import { agruparTarefasPorProjeto, montarDivulgacao } from './painel.js';

describe('agruparTarefasPorProjeto', () => {
  it('agrupa por projeto e separa reais de fictícios, preservando ordem de chegada', () => {
    const linhas = [
      { id: 1, texto: 'Revisar layout', prazo: '2026-09-25', etapa: 'fazendo', projeto_id: 10, projeto_titulo: 'Site A', ficticio: 0 },
      { id: 2, texto: 'Sem prazo', prazo: null, etapa: 'a_fazer', projeto_id: 10, projeto_titulo: 'Site A', ficticio: 0 },
      { id: 3, texto: 'Ajustar case', prazo: null, etapa: 'aguardando_cliente', projeto_id: 20, projeto_titulo: 'Case fictício', ficticio: 1 },
    ];
    expect(agruparTarefasPorProjeto(linhas)).toEqual({
      reais: [
        { projeto_id: 10, projeto_titulo: 'Site A', tarefas: [
          { id: 1, texto: 'Revisar layout', prazo: '2026-09-25', etapa: 'fazendo' },
          { id: 2, texto: 'Sem prazo', prazo: null, etapa: 'a_fazer' },
        ] },
      ],
      ficticios: [
        { projeto_id: 20, projeto_titulo: 'Case fictício', tarefas: [{ id: 3, texto: 'Ajustar case', prazo: null, etapa: 'aguardando_cliente' }] },
      ],
    });
  });

  it('retorna listas vazias quando não há tarefas', () => {
    expect(agruparTarefasPorProjeto([])).toEqual({ reais: [], ficticios: [] });
  });
});

describe('montarDivulgacao', () => {
  it('lista só os canais que faltam', () => {
    const linhas = [{ id: 1, titulo: 'Site A', ficticio: 0, postou_instagram: 0, portfolio_publicado: 1 }];
    expect(montarDivulgacao(linhas)).toEqual([
      { projeto_id: 1, projeto_titulo: 'Site A', ficticio: false, falta: ['instagram'] },
    ]);
  });

  it('lista os dois canais quando falta tudo', () => {
    const linhas = [{ id: 2, titulo: 'Case fictício', ficticio: 1, postou_instagram: 0, portfolio_publicado: 0 }];
    expect(montarDivulgacao(linhas)).toEqual([
      { projeto_id: 2, projeto_titulo: 'Case fictício', ficticio: true, falta: ['instagram', 'portfolio'] },
    ]);
  });

  it('deixa de fora o projeto já divulgado nos dois canais', () => {
    const linhas = [{ id: 3, titulo: 'Loja X', ficticio: 0, postou_instagram: 1, portfolio_publicado: 1 }];
    expect(montarDivulgacao(linhas)).toEqual([]);
  });
});
