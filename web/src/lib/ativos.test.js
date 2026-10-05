import { describe, it, expect } from 'vitest';
import { apenasAtivos } from './ativos.js';

describe('apenasAtivos', () => {
  it('mantém só os itens ativos', () => {
    const lista = [{ id: 1, ativo: 1 }, { id: 2, ativo: 0 }];
    expect(apenasAtivos(lista, '').map((i) => i.id)).toEqual([1]);
  });

  it('mantém o item inativo já selecionado, para não perder a referência ao editar', () => {
    const lista = [{ id: 1, ativo: 1 }, { id: 2, ativo: 0 }];
    expect(apenasAtivos(lista, '2').map((i) => i.id)).toEqual([1, 2]);
  });

  it('lida com lista nula', () => {
    expect(apenasAtivos(null, '')).toEqual([]);
  });
});
