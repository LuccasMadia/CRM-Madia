import { Router } from 'express';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { criarRepo, linha, emTransacao } from '../repos/crud.js';
import { repoProjetos } from '../repos/projetos.js';
import { repoConteudoMidias } from '../repos/conteudoMidias.js';
import { validar, lerId } from '../http/validar.js';
import { ErroHttp, ErroValidacao, naoEncontrado } from '../http/erros.js';
import { criarUpload, removerArquivos, EXTENSOES_MIDIA_POST } from '../http/upload.js';
import { ehAcessoPublico } from '../http/protecao.js';
import { aceitaVideo, validarParaPublicar, MENSAGEM_CARROSSEL_VIDEO } from '../instagram/regrasPublicacao.js';
import { prepararMidia } from '../instagram/midiaArquivo.js';
import { TIPOS_CONTEUDO, ESTADOS_CONTEUDO, ESTADOS_PUBLICACAO } from '../domain/regras.js';

const REGRAS_CONTEUDO = {
  projeto_id: { tipo: 'inteiro' },
  tipo: { tipo: 'enum', valores: TIPOS_CONTEUDO, obrigatorio: true },
  titulo: { tipo: 'texto', obrigatorio: true },
  legenda: { tipo: 'texto' },
  estado: { tipo: 'enum', valores: ESTADOS_CONTEUDO, padrao: 'rascunho' },
  data_planejada: { tipo: 'data' },
};
const CAMPOS = [...Object.keys(REGRAS_CONTEUDO), 'ordem'];
const SELECT = 'SELECT c.*, p.titulo AS projeto_titulo FROM conteudos c LEFT JOIN projetos p ON p.id = c.projeto_id';
const TAMANHO_MAXIMO_MIDIA = 300 * 1024 * 1024;
const MENSAGEM_POST_VIDEO = 'Post aceita só imagem.';

const TODOS_ESTADOS = [...ESTADOS_CONTEUDO, ...ESTADOS_PUBLICACAO];
const REGEX_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

export function rotasConteudos({ db, dataDir, publicador }) {
  const conteudos = criarRepo(db, 'conteudos', CAMPOS);
  const projetos = repoProjetos(db);
  const midias = repoConteudoMidias(db);
  const uploadsDir = path.join(dataDir, 'uploads');
  const upload = criarUpload(dataDir, EXTENSOES_MIDIA_POST, { tamanhoMaximo: TAMANHO_MAXIMO_MIDIA });
  const r = Router();

  const obterCompleto = (id) => midias.comMidias(linha(db.prepare(`${SELECT} WHERE c.id = ?`).get(id)));
  const fimDaFila = () =>
    db.prepare("SELECT COALESCE(MAX(ordem) + 1, 0) AS n FROM conteudos WHERE estado = 'pronto' AND midia_id IS NULL").get().n;
  const apagarArquivos = (arquivos) => arquivos.forEach((a) => rmSync(path.join(uploadsDir, a), { force: true }));

  function exigirProjeto(projetoId) {
    if (projetoId != null && !projetos.obter(projetoId)) {
      throw new ErroValidacao([{ campo: 'projeto_id', mensagem: 'Projeto não encontrado' }]);
    }
  }
  function exigir(id) {
    const atual = conteudos.obter(id);
    if (!atual) throw naoEncontrado('Conteúdo');
    return atual;
  }
  function exigirEditavel(conteudo) {
    if (conteudo.estado === 'publicando') throw new ErroHttp(409, 'Este post está sendo publicado.');
  }
  function exigirEditavelPorId(id) {
    const atual = exigir(id);
    exigirEditavel(atual);
    return atual;
  }
  // Roda antes do multer: o que for recusado aqui não chega a gravar nada em disco.
  function prepararEnvio(req, res, next) {
    if (ehAcessoPublico(req)) throw new ErroHttp(403, 'Suba a mídia pelo PC.');
    req.conteudo = exigirEditavelPorId(lerId(req.params.id));
    next();
  }

  r.get('/conteudos', (req, res) => {
    const condicoes = ['c.midia_id IS NULL'];
    const args = [];
    if (req.query.estado) {
      if (!TODOS_ESTADOS.includes(req.query.estado)) {
        throw new ErroValidacao([{ campo: 'estado', mensagem: 'Estado inválido' }]);
      }
      condicoes.push('c.estado = ?');
      args.push(req.query.estado);
    }
    if (req.query.projeto_id) {
      condicoes.push('c.projeto_id = ?');
      args.push(Number(req.query.projeto_id));
    }
    const lista = db
      .prepare(`${SELECT} WHERE ${condicoes.join(' AND ')} ORDER BY c.estado DESC, c.ordem, c.id`)
      .all(...args)
      .map(linha)
      .map(midias.comMidias);
    res.json(lista);
  });

  // Declarada antes de /conteudos/:id para "avisos" não ser lido como id.
  r.get('/conteudos/avisos', (req, res) => {
    const buscar = (estado, ordem) =>
      db.prepare(`${SELECT} WHERE c.estado = ? AND c.midia_id IS NULL ORDER BY ${ordem}`).all(estado).map(linha).map(midias.comMidias);
    res.json({
      atrasados: buscar('atrasado', 'c.agendado_para, c.id'),
      falhas: buscar('falhou', 'c.atualizado_em DESC, c.id DESC'),
    });
  });

  r.post('/conteudos', (req, res) => {
    const dados = validar(req.body, REGRAS_CONTEUDO);
    exigirProjeto(dados.projeto_id);
    if (dados.estado === 'pronto') dados.ordem = fimDaFila();
    res.status(201).json(obterCompleto(conteudos.criar(dados).id));
  });

  // Declarada antes de /conteudos/:id para "ordem" não ser lida como id.
  r.put('/conteudos/ordem', (req, res) => {
    const ids = req.body?.ids;
    const atuais = db.prepare("SELECT id FROM conteudos WHERE estado = 'pronto' AND midia_id IS NULL").all().map((c) => c.id);
    const valido =
      Array.isArray(ids) && ids.length === atuais.length && new Set(ids).size === ids.length && ids.every((id) => atuais.includes(id));
    if (!valido) throw new ErroValidacao([{ campo: 'ids', mensagem: 'A lista deve conter exatamente os conteúdos prontos' }]);
    const atualizar = db.prepare('UPDATE conteudos SET ordem = ? WHERE id = ?');
    emTransacao(db, () => ids.forEach((id, indice) => atualizar.run(indice, id)));
    res.status(204).end();
  });

  r.get('/conteudos/:id', (req, res) => {
    const id = lerId(req.params.id);
    exigir(id);
    res.json(obterCompleto(id));
  });

  r.put('/conteudos/:id', (req, res) => {
    const id = lerId(req.params.id);
    const atual = exigirEditavelPorId(id);
    const dados = validar(req.body, REGRAS_CONTEUDO, { parcial: true });
    exigirProjeto(dados.projeto_id);
    // Estados de publicação só mudam pelas rotas de publicar/agendar.
    if (!ESTADOS_CONTEUDO.includes(atual.estado)) delete dados.estado;
    if (dados.estado === 'pronto' && atual.estado !== 'pronto') dados.ordem = fimDaFila();
    conteudos.atualizar(id, dados);
    res.json(obterCompleto(id));
  });

  r.delete('/conteudos/:id', (req, res) => {
    const id = lerId(req.params.id);
    exigirEditavelPorId(id);
    const arquivos = midias.arquivosDe(id);
    conteudos.remover(id);
    apagarArquivos(arquivos);
    res.status(204).end();
  });

  r.post('/conteudos/:id/publicar', (req, res) => {
    const id = lerId(req.params.id);
    publicador.iniciar(id); // valida e trava de forma síncrona; o envio segue em segundo plano
    res.status(202).json(obterCompleto(id));
  });

  r.post('/conteudos/:id/agendar', (req, res) => {
    const atual = exigirEditavelPorId(lerId(req.params.id));
    if (atual.estado === 'publicado') throw new ErroHttp(409, 'Este post já foi publicado.');
    const momento = Date.parse(req.body?.agendado_para);
    if (typeof req.body?.agendado_para !== 'string' || !REGEX_ISO.test(req.body.agendado_para) || Number.isNaN(momento)) {
      throw new ErroValidacao([{ campo: 'agendado_para', mensagem: 'Data e hora inválidas.' }]);
    }
    if (momento <= Date.now()) throw new ErroValidacao([{ campo: 'agendado_para', mensagem: 'Escolha um horário no futuro.' }]);
    const erros = validarParaPublicar(atual, midias.listar(atual.id));
    if (erros.length) throw new ErroValidacao(erros.map((mensagem) => ({ campo: 'publicacao', mensagem })));
    db.prepare(
      "UPDATE conteudos SET estado = 'agendado', agendado_para = ?, publicacao_erro = NULL, atualizado_em = ? WHERE id = ?",
    ).run(new Date(momento).toISOString(), new Date().toISOString(), atual.id);
    res.json(obterCompleto(atual.id));
  });

  r.delete('/conteudos/:id/agendamento', (req, res) => {
    const atual = exigirEditavelPorId(lerId(req.params.id));
    if (atual.estado !== 'agendado' && atual.estado !== 'atrasado') throw new ErroHttp(409, 'Este post não está agendado.');
    db.prepare("UPDATE conteudos SET estado = 'rascunho', agendado_para = NULL, atualizado_em = ? WHERE id = ?").run(
      new Date().toISOString(),
      atual.id,
    );
    res.json(obterCompleto(atual.id));
  });

  r.post('/conteudos/:id/midias', prepararEnvio, upload.array('midias', 10), async (req, res) => {
    const conteudo = req.conteudo;
    const enviados = req.files ?? [];
    const recusar = (erro) => {
      removerArquivos(enviados);
      throw erro;
    };
    if (enviados.length === 0) recusar(new ErroValidacao([{ campo: 'midias', mensagem: 'Envie ao menos uma mídia' }]));
    if (enviados.some((f) => f.mimetype.startsWith('video/')) && !aceitaVideo(conteudo.tipo)) {
      const mensagem = conteudo.tipo === 'post' ? MENSAGEM_POST_VIDEO : MENSAGEM_CARROSSEL_VIDEO;
      recusar(new ErroValidacao([{ campo: 'midias', mensagem }]));
    }

    const preparadas = [];
    try {
      for (const arquivo of enviados) preparadas.push(await prepararMidia(arquivo, uploadsDir));
    } catch (erro) {
      // prepararMidia já apagou o arquivo que falhou; falta o que não foi processado e o que já foi.
      removerArquivos(enviados);
      apagarArquivos(preparadas.map((m) => m.arquivo));
      throw erro;
    }
    emTransacao(db, () => preparadas.forEach((m) => midias.adicionar(conteudo.id, m)));
    res.json(obterCompleto(conteudo.id));
  });

  r.put('/conteudos/:id/midias/ordem', (req, res) => {
    const atual = exigirEditavelPorId(lerId(req.params.id));
    if (!midias.reordenar(atual.id, req.body?.ids)) {
      throw new ErroValidacao([{ campo: 'ids', mensagem: 'A lista deve conter exatamente as mídias do conteúdo' }]);
    }
    res.json(obterCompleto(atual.id));
  });

  r.delete('/conteudos/:id/midias/:midiaId', (req, res) => {
    const atual = exigirEditavelPorId(lerId(req.params.id));
    const midia = midias.obter(lerId(req.params.midiaId));
    if (!midia || midia.conteudo_id !== atual.id) throw naoEncontrado('Mídia');
    midias.remover(midia.id);
    apagarArquivos([midia.arquivo]);
    res.json(obterCompleto(atual.id));
  });

  return r;
}
