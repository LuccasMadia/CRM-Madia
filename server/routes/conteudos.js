import { Router } from 'express';
import { criarRepo, linha } from '../repos/crud.js';
import { repoProjetos } from '../repos/projetos.js';
import { validar, lerId } from '../http/validar.js';
import { ErroValidacao, naoEncontrado } from '../http/erros.js';
import { CANAIS, TIPOS_CONTEUDO, STATUS_CONTEUDO, aplicarRegrasConteudo } from '../domain/regras.js';

const REGRAS_CONTEUDO = {
  projeto_id: { tipo: 'inteiro' },
  canal: { tipo: 'enum', valores: CANAIS, obrigatorio: true },
  tipo: { tipo: 'enum', valores: TIPOS_CONTEUDO, obrigatorio: true },
  titulo: { tipo: 'texto', obrigatorio: true },
  legenda: { tipo: 'texto' },
  status: { tipo: 'enum', valores: STATUS_CONTEUDO, padrao: 'ideia' },
  data_planejada: { tipo: 'data' },
  data_publicada: { tipo: 'data' },
  link: { tipo: 'texto' },
};
const CAMPOS = Object.keys(REGRAS_CONTEUDO);
const SELECT = 'SELECT c.*, p.titulo AS projeto_titulo FROM conteudos c LEFT JOIN projetos p ON p.id = c.projeto_id';

export function rotasConteudos({ db, hoje }) {
  const conteudos = criarRepo(db, 'conteudos', CAMPOS);
  const projetos = repoProjetos(db);
  const r = Router();

  const obterCompleto = (id) => linha(db.prepare(`${SELECT} WHERE c.id = ?`).get(id));
  function exigirProjeto(projetoId) {
    if (projetoId != null && !projetos.obter(projetoId)) {
      throw new ErroValidacao([{ campo: 'projeto_id', mensagem: 'Projeto não encontrado' }]);
    }
  }

  r.get('/conteudos', (req, res) => {
    const condicoes = [];
    const args = [];
    for (const campo of ['canal', 'status']) {
      if (req.query[campo]) {
        condicoes.push(`c.${campo} = ?`);
        args.push(req.query[campo]);
      }
    }
    if (req.query.projeto_id) {
      condicoes.push('c.projeto_id = ?');
      args.push(Number(req.query.projeto_id));
    }
    const where = condicoes.length ? ` WHERE ${condicoes.join(' AND ')}` : '';
    const lista = db
      .prepare(`${SELECT}${where} ORDER BY c.data_planejada IS NULL, c.data_planejada, c.id`)
      .all(...args)
      .map(linha);
    res.json(lista);
  });

  r.post('/conteudos', (req, res) => {
    const dados = aplicarRegrasConteudo(null, validar(req.body, REGRAS_CONTEUDO), hoje());
    exigirProjeto(dados.projeto_id);
    res.status(201).json(obterCompleto(conteudos.criar(dados).id));
  });

  r.put('/conteudos/:id', (req, res) => {
    const id = lerId(req.params.id);
    const atual = conteudos.obter(id);
    if (!atual) throw naoEncontrado('Conteúdo');
    const dados = aplicarRegrasConteudo(atual, validar(req.body, REGRAS_CONTEUDO, { parcial: true }), hoje());
    exigirProjeto(dados.projeto_id);
    conteudos.atualizar(id, dados);
    res.json(obterCompleto(id));
  });

  r.delete('/conteudos/:id', (req, res) => {
    if (!conteudos.remover(lerId(req.params.id))) throw naoEncontrado('Conteúdo');
    res.status(204).end();
  });

  return r;
}
