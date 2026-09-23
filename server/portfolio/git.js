import { execFileSync } from 'node:child_process';
import { ErroHttp } from '../http/erros.js';
import { CAMINHO_JSON, PASTA_IMAGENS } from './write.js';

const CAMINHOS = [CAMINHO_JSON, PASTA_IMAGENS];
const MENSAGEM = 'chore(portfolio): atualiza projetos via CRM';

function git(repo, args) {
  try {
    return execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (erro) {
    const detalhe = (erro.stderr || erro.stdout || erro.message).toString().trim();
    throw new ErroHttp(502, `git ${args[0]} falhou:\n${detalhe}`);
  }
}

export function commitarPortfolio(repo, { push = true } = {}) {
  git(repo, ['add', '-A', '--', ...CAMINHOS]);
  const pendentes = git(repo, ['diff', '--cached', '--name-only', '--', ...CAMINHOS]).trim();
  if (!pendentes) return { commitado: false, saida: 'Nada para commitar: o portfólio já está atualizado.' };
  // O pathspec no commit garante que só os caminhos do CRM entram, mesmo com outros arquivos no stage.
  let saida = git(repo, ['commit', '-m', MENSAGEM, '--', ...CAMINHOS]);
  if (push) saida += git(repo, ['push']);
  return { commitado: true, saida };
}
