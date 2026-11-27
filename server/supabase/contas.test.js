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
    expect(lerContas(db)).toEqual([{ id: 1, email: 'Principal', token: 'sbp_antigo' }]);
    expect(obterConfig(db, 'supabase_token')).toBeNull();
    expect(lerContas(db)).toEqual([{ id: 1, email: 'Principal', token: 'sbp_antigo' }]);
  });

  it('guarda e lê várias contas; lista vazia apaga a chave', () => {
    const { db } = criarContexto();
    salvarContas(db, [{ id: 1, email: 'ana@exemplo.com', token: 'a' }, { id: 3, email: 'bia@exemplo.com', token: 'b' }]);
    expect(lerContas(db).map((c) => c.email)).toEqual(['ana@exemplo.com', 'bia@exemplo.com']);
    salvarContas(db, []);
    expect(obterConfig(db, 'supabase_contas')).toBeNull();
    expect(lerContas(db)).toEqual([]);
  });

  it('contas guardadas com o campo antigo `nome` passam a usar esse texto como e-mail', () => {
    const { db } = criarContexto();
    definirConfig(db, 'supabase_contas', JSON.stringify([{ id: 1, nome: 'Conta Dri', token: 'a' }]));
    expect(lerContas(db)).toEqual([{ id: 1, email: 'Conta Dri', token: 'a' }]);
  });

  it('JSON corrompido é tratado como sem contas', () => {
    const { db } = criarContexto();
    definirConfig(db, 'supabase_contas', '{quebrado');
    expect(lerContas(db)).toEqual([]);
  });
});
