import { describe, it, expect } from 'vitest';
import { githubFalso } from '../test/githubFalso.js';
import { criarClienteSupabase, ErroSupabase, normalizarEstado } from './cliente.js';

const URL = 'https://api.supabase.com/v1/projects';
const bruto = (ref, status, extra = {}) => ({ id: ref, name: `Projeto ${ref}`, region: 'sa-east-1', status, created_at: '2026-01-01T00:00:00Z', ...extra });

describe('normalizarEstado', () => {
  it.each([
    ['ACTIVE_HEALTHY', 'no_ar'], ['INACTIVE', 'pausado'], ['PAUSING', 'pausado'],
    ['COMING_UP', 'subindo'], ['RESTORING', 'subindo'], ['QUALQUER_OUTRO', 'outro'], [undefined, 'outro'],
  ])('%s vira %s', (status, estado) => {
    expect(normalizarEstado(status)).toBe(estado);
  });
});

describe('cliente do Supabase', () => {
  it('lista os projetos mandando o token e mapeia o formato', async () => {
    const { fetch, requisicoes } = githubFalso({ [URL]: [bruto('abcdefghijklmnopqrst', 'INACTIVE'), bruto('zzzzzzzzzzzzzzzzzzzz', 'ACTIVE_HEALTHY')] });
    const lista = await criarClienteSupabase({ token: 'sbp_tok', fetch }).listarProjetos();
    expect(lista).toEqual([
      { ref: 'abcdefghijklmnopqrst', nome: 'Projeto abcdefghijklmnopqrst', regiao: 'sa-east-1', estado: 'pausado', link: 'https://supabase.com/dashboard/project/abcdefghijklmnopqrst' },
      { ref: 'zzzzzzzzzzzzzzzzzzzz', nome: 'Projeto zzzzzzzzzzzzzzzzzzzz', regiao: 'sa-east-1', estado: 'no_ar', link: 'https://supabase.com/dashboard/project/zzzzzzzzzzzzzzzzzzzz' },
    ]);
    expect(requisicoes[0].headers.Authorization).toBe('Bearer sbp_tok');
  });

  it('401 vira erro de token inválido com a mensagem em português', async () => {
    const { fetch } = githubFalso({ [URL]: { status: 401, corpo: {} } });
    const erro = await criarClienteSupabase({ token: 'x', fetch }).listarProjetos().catch((e) => e);
    expect(erro).toBeInstanceOf(ErroSupabase);
    expect(erro.tokenInvalido).toBe(true);
    expect(erro.message).toBe('Token do Supabase inválido ou sem permissão. Cole um novo em Configurações → Supabase.');
  });

  it('falha de rede vira mensagem de internet', async () => {
    const erro = await criarClienteSupabase({ token: 'x', fetch: () => Promise.reject(new Error('rede')) }).listarProjetos().catch((e) => e);
    expect(erro.message).toBe('Não foi possível falar com o Supabase. Verifique a internet.');
  });
});
