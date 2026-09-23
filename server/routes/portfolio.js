import { Router } from 'express';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { repoPortfolio } from '../repos/portfolio.js';
import { repoProjetos } from '../repos/projetos.js';
import { emTransacao } from '../repos/crud.js';
import { reordenar } from '../repos/ordem.js';
import { validar, lerId } from '../http/validar.js';
import { ErroHttp, ErroValidacao, naoEncontrado } from '../http/erros.js';
import { criarUpload, removerArquivos } from '../http/upload.js';

const REGRAS_PORTFOLIO = {
  publicar: { tipo: 'bool' },
  slug: { tipo: 'slug' },
  titulo_publico: { tipo: 'texto' },
  descricao_publica: { tipo: 'texto' },
  stack: { tipo: 'lista' },
  status_publico: { tipo: 'texto' },
  live_url: { tipo: 'texto' },
  code_url: { tipo: 'texto' },
  ordem: { tipo: 'inteiro', min: 0, padrao: 0 },
};
const REGRAS_SLIDE = {
  titulo: { tipo: 'texto' },
  descricao: { tipo: 'texto' },
  imagem_id: { tipo: 'inteiro' },
};

export function rotasPortfolio({ db, dataDir }) {
  const pf = repoPortfolio(db);
  const projetos = repoProjetos(db);
  const upload = criarUpload(dataDir);
  const r = Router();

  function doProjeto(req) {
    const projetoId = lerId(req.params.id);
    if (!projetos.obter(projetoId)) throw naoEncontrado('Projeto');
    return pf.garantir(projetoId);
  }

  function checarImagem(portfolio, imagemId) {
    if (imagemId == null) return;
    const imagem = pf.imagens.obter(imagemId);
    if (!imagem || imagem.portfolio_id !== portfolio.id) {
      throw new ErroValidacao([{ campo: 'imagem_id', mensagem: 'A imagem não pertence a este projeto' }]);
    }
  }

  r.get('/projetos/:id/portfolio', (req, res) => res.json(pf.montar(doProjeto(req))));

  r.put('/projetos/:id/portfolio', (req, res) => {
    const atual = doProjeto(req);
    const dados = validar(req.body, REGRAS_PORTFOLIO, { parcial: true });
    if (dados.slug) {
      const dono = pf.obterPorSlug(dados.slug);
      if (dono && dono.id !== atual.id) throw new ErroValidacao([{ campo: 'slug', mensagem: 'Já usado por outro projeto' }]);
    }
    res.json(pf.montar(pf.atualizar(atual.id, dados)));
  });

  r.post('/projetos/:id/portfolio/imagens', upload.array('imagens', 20), (req, res) => {
    let atual;
    try {
      atual = doProjeto(req);
    } catch (erro) {
      removerArquivos(req.files);
      throw erro;
    }
    if (!req.files?.length) throw new ErroHttp(400, 'Nenhuma imagem enviada');
    emTransacao(db, () => req.files.forEach((arquivo) => pf.adicionarImagem(atual.id, arquivo.filename)));
    res.status(201).json(pf.montar(atual));
  });

  r.put('/projetos/:id/portfolio/imagens/ordem', (req, res) => {
    const atual = doProjeto(req);
    reordenar(db, 'portfolio_imagens', 'portfolio_id', atual.id, req.body?.ids);
    res.json(pf.montar(atual));
  });

  r.delete('/portfolio/imagens/:id', (req, res) => {
    const imagem = pf.imagens.obter(lerId(req.params.id));
    if (!imagem) throw naoEncontrado('Imagem');
    if (pf.slidesUsandoImagem(imagem.id) > 0) {
      throw new ErroHttp(409, 'Esta imagem é usada no case study. Troque a imagem do slide antes de excluir.');
    }
    pf.imagens.remover(imagem.id);
    rmSync(path.join(dataDir, 'uploads', imagem.arquivo), { force: true });
    res.json(pf.montar(pf.obter(imagem.portfolio_id)));
  });

  r.post('/projetos/:id/portfolio/case-study', (req, res) => {
    const atual = doProjeto(req);
    const dados = validar(req.body, REGRAS_SLIDE);
    checarImagem(atual, dados.imagem_id);
    pf.criarSlide(atual.id, dados);
    res.status(201).json(pf.montar(atual));
  });

  r.put('/projetos/:id/portfolio/case-study/ordem', (req, res) => {
    const atual = doProjeto(req);
    reordenar(db, 'portfolio_case_study', 'portfolio_id', atual.id, req.body?.ids);
    res.json(pf.montar(atual));
  });

  r.put('/portfolio/case-study/:id', (req, res) => {
    const slide = pf.slides.obter(lerId(req.params.id));
    if (!slide) throw naoEncontrado('Slide');
    const portfolio = pf.obter(slide.portfolio_id);
    const dados = validar(req.body, REGRAS_SLIDE, { parcial: true });
    checarImagem(portfolio, dados.imagem_id);
    pf.slides.atualizar(slide.id, dados);
    res.json(pf.montar(portfolio));
  });

  r.delete('/portfolio/case-study/:id', (req, res) => {
    const slide = pf.slides.obter(lerId(req.params.id));
    if (!slide) throw naoEncontrado('Slide');
    pf.slides.remover(slide.id);
    res.json(pf.montar(pf.obter(slide.portfolio_id)));
  });

  return r;
}
