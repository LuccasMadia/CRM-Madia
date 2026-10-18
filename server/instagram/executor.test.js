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

  it('reiniciar durante uma execução roda outra logo depois', async () => {
    const soltar = [];
    const fn = vi.fn(() => new Promise((r) => { soltar.push(r); }));
    const executor = criarExecutorUnico(fn);
    const primeira = executor.executar();
    const a = executor.reiniciar();
    const b = executor.reiniciar();
    expect(executor.executar()).toBe(a);
    soltar[0]('antiga');
    expect(await primeira).toBe('antiga');
    await vi.waitFor(() => expect(fn).toHaveBeenCalledTimes(2));
    expect(executor.emAndamento()).toBe(true);
    soltar[1]('nova');
    expect(await a).toBe('nova');
    expect(await b).toBe('nova');
    expect(executor.emAndamento()).toBe(false);
  });

  it('reiniciar sem execução em andamento só executa', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const executor = criarExecutorUnico(fn);
    expect(await executor.reiniciar()).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
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
