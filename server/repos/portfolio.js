import { criarRepo, linha } from './crud.js';
import { proximaOrdem } from './ordem.js';

export const CAMPOS_PORTFOLIO = [
  'projeto_id', 'publicar', 'slug', 'titulo_publico', 'descricao_publica',
  'stack', 'status_publico', 'live_url', 'code_url', 'ordem',
];

export function repoPortfolio(db) {
  const base = criarRepo(db, 'portfolio', CAMPOS_PORTFOLIO);
  const imagens = criarRepo(db, 'portfolio_imagens', ['portfolio_id', 'arquivo', 'ordem']);
  const slides = criarRepo(db, 'portfolio_case_study', ['portfolio_id', 'titulo', 'descricao', 'imagem_id', 'ordem']);

  const obterPorProjeto = (projetoId) => linha(db.prepare('SELECT * FROM portfolio WHERE projeto_id = ?').get(projetoId));
  const obterPorSlug = (slug) => linha(db.prepare('SELECT * FROM portfolio WHERE slug = ?').get(slug));

  function garantir(projetoId) {
    const existente = obterPorProjeto(projetoId);
    if (existente) return existente;
    const ordem = db.prepare('SELECT COALESCE(MAX(ordem) + 1, 0) AS n FROM portfolio').get().n;
    return base.criar({ projeto_id: projetoId, ordem });
  }

  function montar(pf) {
    return {
      ...pf,
      publicar: Boolean(pf.publicar),
      stack: JSON.parse(pf.stack),
      imagens: imagens.listar({ portfolio_id: pf.id }, 'ordem, id').map((i) => ({ ...i, url: `/uploads/${i.arquivo}` })),
      case_study: slides.listar({ portfolio_id: pf.id }, 'ordem, id'),
    };
  }

  function adicionarImagem(portfolioId, arquivo) {
    return imagens.criar({ portfolio_id: portfolioId, arquivo, ordem: proximaOrdem(db, 'portfolio_imagens', 'portfolio_id', portfolioId) });
  }

  function criarSlide(portfolioId, dados) {
    return slides.criar({
      ...dados,
      portfolio_id: portfolioId,
      ordem: proximaOrdem(db, 'portfolio_case_study', 'portfolio_id', portfolioId),
    });
  }

  const slidesUsandoImagem = (imagemId) =>
    db.prepare('SELECT COUNT(*) AS n FROM portfolio_case_study WHERE imagem_id = ?').get(imagemId).n;

  function carregarParaPublicacao() {
    return db
      .prepare(
        `SELECT pf.*, p.titulo AS projeto_titulo FROM portfolio pf
         JOIN projetos p ON p.id = pf.projeto_id
         WHERE pf.publicar = 1 ORDER BY pf.ordem, pf.id`,
      )
      .all()
      .map((row) => montar(linha(row)));
  }

  const contarEntregues = () => db.prepare("SELECT COUNT(*) AS n FROM projetos WHERE etapa = 'entregue'").get().n;

  return {
    ...base, obterPorProjeto, obterPorSlug, garantir, montar, imagens, slides,
    adicionarImagem, criarSlide, slidesUsandoImagem, carregarParaPublicacao, contarEntregues,
  };
}
