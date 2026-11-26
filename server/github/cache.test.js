import { describe, it, expect } from 'vitest';
import { criarCache } from './cache.js';

describe('criarCache', () => {
  it('reaproveita dentro do tempo e recalcula depois ou com forcar', async () => {
    let agora = 0;
    let chamadas = 0;
    const cache = criarCache(1000, () => agora);
    const produzir = async () => { chamadas += 1; return chamadas; };
    expect(await cache.obter('a', produzir)).toBe(1);
    agora = 999;
    expect(await cache.obter('a', produzir)).toBe(1);
    expect(await cache.obter('a', produzir, { forcar: true })).toBe(2);
    agora = 1998;
    expect(await cache.obter('a', produzir)).toBe(2);
    agora = 1999;
    expect(await cache.obter('a', produzir)).toBe(3);
  });

  it('não guarda erro e separa chaves; limpar apaga tudo', async () => {
    const cache = criarCache(1000, () => 0);
    await expect(cache.obter('x', async () => { throw new Error('falhou'); })).rejects.toThrow('falhou');
    expect(await cache.obter('x', async () => 'ok')).toBe('ok');
    expect(await cache.obter('y', async () => 'outro')).toBe('outro');
    cache.limpar();
    expect(await cache.obter('x', async () => 'novo')).toBe('novo');
  });
});
