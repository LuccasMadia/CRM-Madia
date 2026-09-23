import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { createServer } from 'vite';
import { ErroHttp } from '../http/erros.js';
import { emTransacao } from '../repos/crud.js';
import { repoClientes } from '../repos/clientes.js';
import { repoProjetos } from '../repos/projetos.js';
import { repoPortfolio } from '../repos/portfolio.js';
import { gerarSlug } from '../domain/slug.js';

export async function lerProjetosDoPortfolio(repo) {
  if (!existsSync(path.join(repo, 'src', 'data', 'content.js'))) {
    throw new ErroHttp(400, `Não encontrei src/data/content.js em ${repo}`);
  }
  // Usa o Vite (sem o vite.config do portfólio) só para resolver os imports de imagem em URLs.
  const servidor = await createServer({
    root: repo,
    configFile: false,
    logLevel: 'silent',
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, watch: null },
  });
  try {
    const modulo = await servidor.ssrLoadModule('/src/data/content.js');
    return modulo.projects;
  } finally {
    await servidor.close();
  }
}

function arquivoDaUrl(repo, url) {
  if (url.startsWith('/@fs/')) return url.slice('/@fs'.length);
  return path.join(repo, url);
}

export async function importarPortfolio({ db, repo, uploadsDir, hoje, ler = lerProjetosDoPortfolio }) {
  const projetosDoSite = await ler(repo);
  const clientes = repoClientes(db);
  const projetos = repoProjetos(db);
  const portfolio = repoPortfolio(db);
  const resultado = { importados: [], ignorados: [] };
  mkdirSync(uploadsDir, { recursive: true });

  projetosDoSite.forEach((site, indice) => {
    const slug = gerarSlug(site.title);
    if (portfolio.obterPorSlug(slug)) {
      resultado.ignorados.push(site.title);
      return;
    }
    const urls = [...new Set([...(site.images ?? []), ...(site.caseStudy ?? []).map((s) => s.imagem)])];
    // Copia primeiro: se faltar um arquivo, nada é gravado no banco.
    const arquivos = urls.map((url) => {
      const origem = arquivoDaUrl(repo, url);
      const nome = randomUUID() + path.extname(origem).toLowerCase();
      copyFileSync(origem, path.join(uploadsDir, nome));
      return nome;
    });
    const entregue = site.status === 'Em funcionamento';

    emTransacao(db, () => {
      const cliente = clientes.criar({ nome: site.title });
      const projeto = projetos.criar({
        cliente_id: cliente.id,
        titulo: site.title,
        etapa: entregue ? 'entregue' : 'andamento',
        data_entrega: entregue ? hoje : null,
        valor_total_centavos: 0,
      });
      const pf = portfolio.criar({
        projeto_id: projeto.id,
        publicar: 1,
        slug,
        titulo_publico: site.title,
        descricao_publica: site.description,
        stack: JSON.stringify(site.stack ?? []),
        status_publico: site.status ?? null,
        live_url: site.liveUrl ?? null,
        code_url: site.codeUrl ?? null,
        ordem: indice,
      });
      const idPorUrl = new Map(urls.map((url, i) => [url, portfolio.adicionarImagem(pf.id, arquivos[i]).id]));
      for (const slide of site.caseStudy ?? []) {
        portfolio.criarSlide(pf.id, { titulo: slide.titulo, descricao: slide.descricao, imagem_id: idPorUrl.get(slide.imagem) });
      }
    });
    resultado.importados.push(site.title);
  });
  return resultado;
}
