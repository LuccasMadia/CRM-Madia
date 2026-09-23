import { describe, it, expect } from 'vitest';
import { montarProximos } from './painel.js';

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
