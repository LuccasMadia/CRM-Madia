import { Router } from 'express';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { criarRepo, linha } from '../repos/crud.js';
import { repoProjetos } from '../repos/projetos.js';
import { validar, lerId } from '../http/validar.js';
import { ErroValidacao, naoEncontrado } from '../http/erros.js';
import { criarUpload, removerArquivos } from '../http/upload.js';
import { emTransacao } from '../repos/crud.js';
import { TIPOS_CONTEUDO, ESTADOS_CONTEUDO } from '../domain/regras.js';

const REGRAS_CONTEUDO = {
  projeto_id: { tipo: 'inteiro' },
  tipo: { tipo: 'enum', valores: TIPOS_CONTEUDO, obrigatorio: true },
  titulo: { tipo: 'texto', obrigatorio: true },
  legenda: { tipo: 'texto' },
  estado: { tipo: 'enum', valores: ESTADOS_CONTEUDO, padrao: 'rascunho' },
  data_planejada: { tipo: 'data' },
};
const CAMPOS = [...Object.keys(REGRAS_CONTEUDO), 'ordem', 'arte'];
const SELECT = 'SELECT c.*, p.titulo AS projeto_titulo FROM conteudos c LEFT JOIN projetos p ON p.id = c.projeto_id';

export function rotasConteudos({ db, dataDir }) {
  const conteudos = criarRepo(db, 'conteudos', CAMPOS);
  const projetos = repoProjetos(db);
  const upload = criarUpload(dataDir);
  const r = Router();

  const obterCompleto = (id) => linha(db.prepare(`${SELECT} WHERE c.id = ?`).get(id));
  const fimDaFila = () =>
    db.prepare("SELECT COALESCE(MAX(ordem) + 1, 0) AS n FROM conteudos WHERE estado = 'pronto' AND midia_id IS NULL").get().n;
  const apagarArte = (arte) => arte && rmSync(path.join(dataDir, 'uploads', arte), { force: true });

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

  r.get('/conteudos', (req, res) => {
    const condicoes = ['c.midia_id IS NULL'];
    const args = [];
    if (req.query.estado) {
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
      .map(linha);
    res.json(lista);
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

  r.put('/conteudos/:id', (req, res) => {
    const id = lerId(req.params.id);
    const atual = exigir(id);
    const dados = validar(req.body, REGRAS_CONTEUDO, { parcial: true });
    exigirProjeto(dados.projeto_id);
    if (dados.estado === 'pronto' && atual.estado !== 'pronto') dados.ordem = fimDaFila();
    conteudos.atualizar(id, dados);
    res.json(obterCompleto(id));
  });

  r.delete('/conteudos/:id', (req, res) => {
    const id = lerId(req.params.id);
    const atual = exigir(id);
    conteudos.remover(id);
    apagarArte(atual.arte);
    res.status(204).end();
  });

  r.post('/conteudos/:id/arte', upload.single('arte'), (req, res) => {
    let atual;
    try {
      atual = exigir(lerId(req.params.id));
      if (!req.file) throw new ErroValidacao([{ campo: 'arte', mensagem: 'Envie uma imagem' }]);
    } catch (erro) {
      removerArquivos(req.file ? [req.file] : []);
      throw erro;
    }
    conteudos.atualizar(atual.id, { arte: req.file.filename });
    apagarArte(atual.arte);
    res.json(obterCompleto(atual.id));
  });

  r.delete('/conteudos/:id/arte', (req, res) => {
    const atual = exigir(lerId(req.params.id));
    conteudos.atualizar(atual.id, { arte: null });
    apagarArte(atual.arte);
    res.json(obterCompleto(atual.id));
  });

  return r;
}
