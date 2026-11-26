import { describe, it, expect } from 'vitest';
import { criarContexto } from '../test/contexto.js';
import { obterConfig, definirConfig } from '../repos/config.js';
import { lerContas, salvarContas } from './contas.js';

describe('contas do Supabase', () => {
  it('sem nada guardado não há contas', () => {
    const { db } = criarContexto();
    expect(lerContas(db)).toEqual([]);
  });

  it('o token antigo vira a conta Principal e a chave antiga some', () => {
    const { db } = criarContexto();
    definirConfig(db, 'supabase_token', 'sbp_antigo');
    expect(lerContas(db)).toEqual([{ id: 1, nome: 'Principal', token: 'sbp_antigo' }]);
    expect(obterConfig(db, 'supabase_token')).toBeNull();
    expect(lerContas(db)).toEqual([{ id: 1, nome: 'Principal', token: 'sbp_antigo' }]);
  });

  it('guarda e lê várias contas; lista vazia apaga a chave', () => {
    const { db } = criarContexto();
    salvarContas(db, [{ id: 1, nome: 'Conta 1', token: 'a' }, { id: 3, nome: 'Conta 2', token: 'b' }]);
    expect(lerContas(db).map((c) => c.nome)).toEqual(['Conta 1', 'Conta 2']);
    salvarContas(db, []);
    expect(obterConfig(db, 'supabase_contas')).toBeNull();
    expect(lerContas(db)).toEqual([]);
  });

  it('JSON corrompido é tratado como sem contas', () => {
    const { db } = criarContexto();
    definirConfig(db, 'supabase_contas', '{quebrado');
    expect(lerContas(db)).toEqual([]);
  });
});
