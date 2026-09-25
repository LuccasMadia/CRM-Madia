import { describe, it, expect } from 'vitest';
import { montarProximos, agruparTarefasPorProjeto, montarTarefasDivulgacao } from './painel.js';

describe('montarProximos', () => {
  const HOJE = '2026-09-23';
  const entrada = {
    tarefas: [
      { id: 1, projeto_id: 10, texto: 'Revisar layout', projeto_titulo: 'Site A', prazo: '2026-09-25' },
      { id: 2, projeto_id: 10, texto: 'Longe', projeto_titulo: 'Site A', prazo: '2026-10-30' },
    ],
    parcelas: [{ id: 3, projeto_id: 10, descricao: 'Entrada', projeto_titulo: 'Site A', vencimento: '2026-09-20', valor_centavos: 5000 }],
    entregas: [{ id: 10, titulo: 'Site A', cliente_nome: 'Ana', prazo_entrega: '2026-09-30' }],
    conteudos: [{ id: 4, projeto_id: null, titulo: 'Post case', canal: 'instagram', data_planejada: '2026-09-23' }],
  };

  it('junta os tipos, filtra até hoje + 7 e ordena por data (atrasados primeiro)', () => {
    const itens = montarProximos(entrada, HOJE);
    expect(itens.map((i) => [i.tipo, i.data, i.atrasado])).toEqual([
      ['parcela', '2026-09-20', true],
      ['conteudo', '2026-09-23', false],
      ['tarefa', '2026-09-25', false],
      ['entrega', '2026-09-30', false],
    ]);
    expect(itens[0]).toMatchObject({ titulo: 'Entrada', contexto: 'Site A', valor_centavos: 5000, projeto_id: 10 });
    expect(itens[3]).toMatchObject({ titulo: 'Site A', contexto: 'Ana', projeto_id: 10 });
  });

  it('usa "Parcela" quando a parcela não tem descrição', () => {
    const itens = montarProximos({ parcelas: [{ ...entrada.parcelas[0], descricao: null }] }, HOJE);
    expect(itens[0].titulo).toBe('Parcela');
  });
});

describe('agruparTarefasPorProjeto', () => {
  it('agrupa por projeto e separa reais de fictícios, preservando ordem de chegada', () => {
    const linhas = [
      { id: 1, texto: 'Revisar layout', prazo: '2026-09-25', projeto_id: 10, projeto_titulo: 'Site A', ficticio: 0 },
      { id: 2, texto: 'Sem prazo', prazo: null, projeto_id: 10, projeto_titulo: 'Site A', ficticio: 0 },
      { id: 3, texto: 'Ajustar case', prazo: null, projeto_id: 20, projeto_titulo: 'Case fictício', ficticio: 1 },
    ];
    expect(agruparTarefasPorProjeto(linhas)).toEqual({
      reais: [
        { projeto_id: 10, projeto_titulo: 'Site A', tarefas: [
          { id: 1, texto: 'Revisar layout', prazo: '2026-09-25' },
          { id: 2, texto: 'Sem prazo', prazo: null },
        ] },
      ],
      ficticios: [
        { projeto_id: 20, projeto_titulo: 'Case fictício', tarefas: [{ id: 3, texto: 'Ajustar case', prazo: null }] },
      ],
    });
  });

  it('retorna listas vazias quando não há tarefas', () => {
    expect(agruparTarefasPorProjeto([])).toEqual({ reais: [], ficticios: [] });
  });
});

describe('montarTarefasDivulgacao', () => {
  it('gera um item só para o que falta', () => {
    const linhas = [{ id: 1, titulo: 'Site A', ficticio: 0, postou_instagram: 0, portfolio_publicado: 1 }];
    expect(montarTarefasDivulgacao(linhas)).toEqual([
      { id: 'divulgacao-1-Postar no Instagram', texto: 'Postar no Instagram', prazo: null, projeto_id: 1, projeto_titulo: 'Site A', ficticio: 0 },
    ]);
  });

  it('gera dois itens quando falta tudo', () => {
    const linhas = [{ id: 2, titulo: 'Case fictício', ficticio: 1, postou_instagram: 0, portfolio_publicado: 0 }];
    expect(montarTarefasDivulgacao(linhas)).toEqual([
      { id: 'divulgacao-2-Postar no Instagram', texto: 'Postar no Instagram', prazo: null, projeto_id: 2, projeto_titulo: 'Case fictício', ficticio: 1 },
      { id: 'divulgacao-2-Publicar no portfólio', texto: 'Publicar no portfólio', prazo: null, projeto_id: 2, projeto_titulo: 'Case fictício', ficticio: 1 },
    ]);
  });

  it('não gera nada quando as duas divulgações já foram feitas', () => {
    const linhas = [{ id: 3, titulo: 'Loja X', ficticio: 0, postou_instagram: 1, portfolio_publicado: 1 }];
    expect(montarTarefasDivulgacao(linhas)).toEqual([]);
  });
});
