import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lerPixAtual, gravarPix, CAMINHO_PIX_JSON } from './pix.js';

let repo;
beforeEach(() => {
  repo = mkdtempSync(path.join(os.tmpdir(), 'crm-pix-'));
});

describe('lerPixAtual', () => {
  it('retorna objeto vazio quando o arquivo não existe', () => {
    expect(lerPixAtual(repo)).toEqual({});
  });
});

describe('gravarPix', () => {
  it('cria o arquivo e as pastas quando não existem', () => {
    gravarPix(repo, { id: 42, nome: 'Popy', codigo: '000201...6304ABCD' });
    const arquivo = path.join(repo, CAMINHO_PIX_JSON);
    expect(existsSync(arquivo)).toBe(true);
    expect(JSON.parse(readFileSync(arquivo, 'utf8'))).toEqual({ 42: { nome: 'Popy', codigo: '000201...6304ABCD' } });
  });

  it('faz merge: grava uma segunda entrada sem apagar a primeira', () => {
    gravarPix(repo, { id: 1, nome: 'A', codigo: 'codA' });
    gravarPix(repo, { id: 2, nome: 'B', codigo: 'codB' });
    expect(lerPixAtual(repo)).toEqual({ 1: { nome: 'A', codigo: 'codA' }, 2: { nome: 'B', codigo: 'codB' } });
  });

  it('sobrescreve só a entrada do mesmo id', () => {
    gravarPix(repo, { id: 1, nome: 'A', codigo: 'codA' });
    gravarPix(repo, { id: 1, nome: 'A novo nome', codigo: 'codA2' });
    expect(lerPixAtual(repo)).toEqual({ 1: { nome: 'A novo nome', codigo: 'codA2' } });
  });
});
