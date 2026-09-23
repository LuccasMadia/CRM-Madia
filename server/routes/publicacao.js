import { Router } from 'express';
import path from 'node:path';
import { obterConfig, definirConfig } from '../repos/config.js';
import { repoPortfolio } from '../repos/portfolio.js';
import { ErroHttp, ErroValidacao } from '../http/erros.js';
import { validarRepo, validarItens } from '../portfolio/validate.js';
import { construirPortfolio } from '../portfolio/build.js';
import { diffPortfolio } from '../portfolio/diff.js';
import { gravarPortfolio, lerJsonAtual, hashesDoRepo, hashesDasCopias } from '../portfolio/write.js';
import { commitarPortfolio } from '../portfolio/git.js';
import { importarPortfolio } from '../portfolio/import.js';

const CHAVE_REPO = 'portfolio_repo_path';

export function rotasPublicacao({ db, dataDir, hoje }) {
  const uploadsDir = path.join(dataDir, 'uploads');
  const portfolio = repoPortfolio(db);
  const r = Router();

  function exigirRepo() {
    const repo = obterConfig(db, CHAVE_REPO);
    const erros = validarRepo(repo);
    if (erros.length) throw new ErroHttp(400, erros.join('\n'));
    return repo;
  }

  function preparar() {
    const repo = exigirRepo();
    const itens = portfolio.carregarParaPublicacao();
    const erros = validarItens(itens, uploadsDir);
    if (erros.length) return { repo, erros, diff: null };
    const resultado = construirPortfolio({
      itens,
      projectsDelivered: portfolio.contarEntregues(),
      uploadsDir,
      agora: new Date().toISOString(),
    });
    const atual = lerJsonAtual(repo);
    const diff = diffPortfolio(atual, resultado.json, {
      hashesAtuais: hashesDoRepo(repo, atual),
      hashesNovos: hashesDasCopias(resultado.copias),
    });
    return { repo, erros: [], resultado, atual, diff };
  }

  r.get('/config', (req, res) => res.json({ portfolio_repo_path: obterConfig(db, CHAVE_REPO) }));

  r.put('/config', (req, res) => {
    const caminho = typeof req.body?.portfolio_repo_path === 'string' ? req.body.portfolio_repo_path.trim() : '';
    const erros = validarRepo(caminho);
    if (erros.length) throw new ErroValidacao(erros.map((mensagem) => ({ campo: CHAVE_REPO, mensagem })));
    definirConfig(db, CHAVE_REPO, caminho);
    res.json({ portfolio_repo_path: caminho });
  });

  r.post('/portfolio/previa', (req, res) => {
    const { erros, diff } = preparar();
    res.json({ erros, diff });
  });

  r.post('/portfolio/publicar', (req, res) => {
    const { repo, erros, resultado, atual, diff } = preparar();
    if (erros.length) return res.status(400).json({ erros });
    if (atual && diff.semMudancas) return res.json({ diff, gravado: false });
    gravarPortfolio(repo, resultado);
    res.json({ diff, gravado: true });
  });

  r.post('/portfolio/git', (req, res) => res.json(commitarPortfolio(exigirRepo())));

  r.post('/portfolio/importar', async (req, res) => {
    res.json(await importarPortfolio({ db, repo: exigirRepo(), uploadsDir, hoje: hoje() }));
  });

  return r;
}
