import { describe, it, expect } from 'vitest';
import { montarVizinhos, ligadosA, vizinhosVisiveis } from './ligacoes.js';

const pontos = [
  { id: 'cliente:1', ligacoes: [] },
  { id: 'projeto:1', ligacoes: ['cliente:1'] },
  { id: 'projeto:2', ligacoes: ['cliente:1'] },
  { id: 'tarefa:1', ligacoes: ['projeto:1'] },
  { id: 'parcela:1', ligacoes: ['projeto:1'] },
  { id: 'hospedagem:1', ligacoes: ['projeto:1', 'app:vercel'] },
];

describe('ligadosA', () => {
  const vizinhos = montarVizinhos(pontos);

  it('projeto acende cliente, tarefa, parcela e site', () => {
    expect([...ligadosA('projeto:1', vizinhos).acesos].sort())
      .toEqual(['cliente:1', 'hospedagem:1', 'parcela:1', 'projeto:1', 'tarefa:1']);
  });

  it('tarefa passa pelo projeto e chega ao cliente, mas não ao outro projeto do cliente', () => {
    const { acesos, linhas } = ligadosA('tarefa:1', vizinhos);
    expect(acesos.has('cliente:1')).toBe(true);
    expect(acesos.has('parcela:1')).toBe(true);
    expect(acesos.has('projeto:2')).toBe(false);
    expect(linhas).toContainEqual(['tarefa:1', 'projeto:1']);
    expect(linhas).toContainEqual(['projeto:1', 'cliente:1']);
  });

  it('cliente acende os projetos e o que é de cada um', () => {
    const { acesos } = ligadosA('cliente:1', vizinhos);
    expect(acesos.has('projeto:2')).toBe(true);
    expect(acesos.has('tarefa:1')).toBe(true);
  });

  it('app aparece como vizinho do site', () => {
    expect(ligadosA('app:vercel', vizinhos).acesos.has('hospedagem:1')).toBe(true);
  });

  it('ponto sem ligação só acende ele mesmo', () => {
    expect(ligadosA('nada:1', vizinhos)).toEqual({ linhas: [], acesos: new Set(['nada:1']) });
  });
});

describe('vizinhosVisiveis', () => {
  it('omite vizinho sem rótulo e marca quem está fora do mapa', () => {
    const v = montarVizinhos([{ id: 'a', ligacoes: ['b', 'c', 'd'] }]);
    const rotulos = new Map([['b', 'Bê'], ['c', 'Cê']]);
    expect(vizinhosVisiveis('a', v, rotulos, new Set(['b']))).toEqual([
      { id: 'b', rotulo: 'Bê', noMapa: true },
      { id: 'c', rotulo: 'Cê', noMapa: false },
    ]);
  });
});
