import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validarRepo, validarItens } from './validate.js';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'crm-val-'));

function item(sobrescrever = {}) {
  return {
    projeto_id: 1, projeto_titulo: 'Site', slug: 'site', titulo_publico: 'Site', descricao_publica: 'Desc',
    stack: ['React'], imagens: [{ id: 1, arquivo: 'a.png' }], case_study: [], ...sobrescrever,
  };
}

describe('validarRepo', () => {
  it('exige caminho, pasta, .git e package.json', () => {
    expect(validarRepo('')).toEqual(['Configure o caminho do repositório do portfólio']);
    expect(validarRepo(path.join(tmp(), 'nao-existe'))[0]).toMatch(/Pasta não encontrada/);
    const dir = tmp();
    expect(validarRepo(dir)).toHaveLength(2);
    mkdirSync(path.join(dir, '.git'));
    writeFileSync(path.join(dir, 'package.json'), '{}');
    expect(validarRepo(dir)).toEqual([]);
  });
});

describe('validarItens', () => {
  const uploads = tmp();
  writeFileSync(path.join(uploads, 'a.png'), 'x');

  it('aceita item completo', () => {
    expect(validarItens([item()], uploads)).toEqual([]);
  });

  it('aponta campos faltando com o projeto', () => {
    const erros = validarItens(
      [item({ slug: null, titulo_publico: '', descricao_publica: null, stack: [], imagens: [] })],
      uploads,
    );
    expect(erros.map((e) => e.campo)).toEqual(['slug', 'titulo_publico', 'descricao_publica', 'stack', 'imagens']);
    expect(erros[0]).toMatchObject({ projeto_id: 1, projeto: 'Site' });
  });

  it('acusa slug repetido e slides incompletos', () => {
    const erros = validarItens(
      [item(), item({ projeto_id: 2, case_study: [{ titulo: '', imagem_id: null }] })],
      uploads,
    );
    expect(erros.map((e) => e.mensagem)).toEqual([
      'Slug repetido (também usado em Site)',
      'Slide 1: falta o título',
      'Slide 1: falta a imagem',
    ]);
  });

  it('acusa arquivo de imagem que sumiu de data/uploads', () => {
    const erros = validarItens([item({ imagens: [{ id: 9, arquivo: 'sumiu.png' }] })], uploads);
    expect(erros).toEqual([
      { projeto_id: 1, projeto: 'Site', campo: 'imagens', mensagem: 'Arquivo de imagem não encontrado: sumiu.png' },
    ]);
  });
});
