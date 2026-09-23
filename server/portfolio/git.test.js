import { describe, it, expect, beforeEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { commitarPortfolio } from './git.js';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' });
let repo;
let remoto;

beforeEach(() => {
  remoto = mkdtempSync(path.join(os.tmpdir(), 'crm-remoto-'));
  git(remoto, 'init', '--bare', '-b', 'main');
  repo = mkdtempSync(path.join(os.tmpdir(), 'crm-git-'));
  git(repo, 'init', '-b', 'main');
  git(repo, 'config', 'user.name', 'Teste');
  git(repo, 'config', 'user.email', 'teste@example.com');
  writeFileSync(path.join(repo, 'README.md'), 'x');
  git(repo, 'add', '.');
  git(repo, 'commit', '-m', 'inicial');
  git(repo, 'remote', 'add', 'origin', remoto);
  git(repo, 'push', '-u', 'origin', 'main');
});

function escreverSaida() {
  mkdirSync(path.join(repo, 'src/data'), { recursive: true });
  mkdirSync(path.join(repo, 'public/projects/x'), { recursive: true });
  writeFileSync(path.join(repo, 'src/data/projects.json'), '{}\n');
  writeFileSync(path.join(repo, 'public/projects/x/01.png'), 'A');
}

describe('commitarPortfolio', () => {
  it('commita só os caminhos gerenciados e envia', () => {
    escreverSaida();
    writeFileSync(path.join(repo, 'outro.txt'), 'não commitar');
    git(repo, 'add', 'outro.txt');

    const resultado = commitarPortfolio(repo);
    expect(resultado.commitado).toBe(true);
    const arquivos = git(repo, 'show', '--name-only', '--format=', 'HEAD').trim().split('\n').sort();
    expect(arquivos).toEqual(['public/projects/x/01.png', 'src/data/projects.json']);
    expect(git(remoto, 'log', '-1', '--format=%s', 'main').trim()).toBe('chore(portfolio): atualiza projetos via CRM');
  });

  it('não cria commit quando nada mudou', () => {
    escreverSaida();
    commitarPortfolio(repo);
    expect(commitarPortfolio(repo)).toEqual({ commitado: false, saida: 'Nada para commitar: o portfólio já está atualizado.' });
  });

  it('lança erro 502 com a saída do git quando o push falha', () => {
    escreverSaida();
    git(repo, 'remote', 'set-url', 'origin', path.join(remoto, 'nao-existe'));
    expect(() => commitarPortfolio(repo)).toThrow(expect.objectContaining({ status: 502, message: expect.stringMatching(/git push falhou/) }));
  });
});
