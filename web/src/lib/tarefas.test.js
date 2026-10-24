import { describe, it, expect } from 'vitest';
import { agruparPorPrazo, grupoDoPrazo, itensAtencaoTarefas, prazoCurto } from './tarefas.js';

// 2026-10-21 é uma quarta-feira: a semana fecha no domingo, 25.
const HOJE = '2026-10-21';
const t = (o) => ({ etapa: 'a_fazer', prioridade: 'normal', ...o });

describe('grupos por prazo', () => {
  it('separa atrasadas, hoje, amanhã, esta semana (até domingo), depois, sem prazo e concluídas', () => {
    expect([
      t({ prazo: '2026-10-20' }), t({ prazo: HOJE }), t({ prazo: '2026-10-22' }), t({ prazo: '2026-10-25' }),
      t({ prazo: '2026-10-26' }), t({ prazo: null }), t({ prazo: '2026-10-01', etapa: 'concluido' }),
    ].map((x) => grupoDoPrazo(x, HOJE))).toEqual(['atrasadas', 'hoje', 'amanha', 'semana', 'depois', 'sem_prazo', 'concluidas']);
  });

  it('no grupo, prazo mais cedo primeiro e urgente antes no mesmo dia', () => {
    const grupos = agruparPorPrazo([
      t({ id: 1, prazo: '2026-10-30' }), t({ id: 2, prazo: '2026-10-28', prioridade: 'baixa' }),
      t({ id: 3, prazo: '2026-10-28', prioridade: 'urgente' }),
    ], HOJE);
    expect(grupos.depois.map((x) => x.id)).toEqual([3, 2, 1]);
  });

  it('prazo curto esconde o ano corrente', () => {
    expect(prazoCurto('2026-11-05', HOJE)).toBe('05/11');
    expect(prazoCurto('2027-01-05', HOJE)).toBe('05/01/2027');
  });
});

describe('Pede atenção das tarefas', () => {
  it('conta só as abertas e não mostra o que não existe', () => {
    const itens = itensAtencaoTarefas([
      t({ prazo: '2026-10-19' }), t({ prazo: '2026-10-19', etapa: 'concluido' }),
      t({ etapa: 'aguardando_cliente', etapa_desde: '2026-10-15' }), t({ etapa: 'aguardando_cliente', etapa_desde: '2026-10-16' }),
      t({ prioridade: 'urgente', etapa: 'concluido' }),
    ], HOJE);
    expect(itens.map((i) => [i.texto, i.tom])).toEqual([
      ['1 tarefa atrasada', 'perigo'],
      ['1 aguardando cliente há mais de 5 dias', 'atencao'],
    ]);
    expect(itensAtencaoTarefas([], HOJE)).toEqual([]);
  });
});
