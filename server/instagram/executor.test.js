import { describe, it, expect, vi } from 'vitest';
import { criarExecutorUnico, iniciarPeriodico } from './executor.js';

describe('criarExecutorUnico', () => {
  it('chamadas simultâneas compartilham a mesma execução', async () => {
    let soltar;
    const fn = vi.fn(() => new Promise((r) => { soltar = r; }));
    const executor = criarExecutorUnico(fn);
    const a = executor.executar();
    const b = executor.executar();
    expect(executor.emAndamento()).toBe(true);
    soltar('ok');
    expect(await a).toBe('ok');
    expect(await b).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(executor.emAndamento()).toBe(false);
    executor.executar();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('libera depois de um erro', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce('ok');
    const executor = criarExecutorUnico(fn);
    await expect(executor.executar()).rejects.toThrow('x');
    expect(await executor.executar()).toBe('ok');
  });
});

describe('iniciarPeriodico', () => {
  it('roda já e agenda a cada 6 horas, engolindo erros', async () => {
    const executar = vi.fn().mockRejectedValue(new Error('falhou'));
    const setInterval = vi.fn(() => 42);
    const clearInterval = vi.fn();
    const log = vi.fn();
    const parar = iniciarPeriodico(executar, { setInterval, clearInterval, log });
    expect(executar).toHaveBeenCalledTimes(1);
    expect(setInterval.mock.calls[0][1]).toBe(6 * 60 * 60 * 1000);
    await Promise.resolve();
    await Promise.resolve();
    expect(log).toHaveBeenCalled();
    parar();
    expect(clearInterval).toHaveBeenCalledWith(42);
  });
});
