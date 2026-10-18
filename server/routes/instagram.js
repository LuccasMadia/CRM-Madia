import { Router } from 'express';
import { linha } from '../repos/crud.js';
import { obterConfig, definirConfig } from '../repos/config.js';
import { repoProjetos } from '../repos/projetos.js';
import { validar } from '../http/validar.js';
import { ErroHttp, ErroValidacao, naoEncontrado } from '../http/erros.js';
import { somarDias } from '../domain/datas.js';
import { criarClienteInstagram } from '../instagram/cliente.js';
import { vincular, desvincular, candidatosManuais } from '../instagram/vinculo.js';

const CHAVES_CONEXAO = ['instagram_token', 'instagram_usuario', 'instagram_token_expira_em', 'instagram_ultimo_erro'];
const VALIDADE_TOKEN_MS = 60 * 24 * 60 * 60 * 1000;
const SELECT_MIDIA = `
  SELECT m.*, p.titulo AS projeto_titulo, c.id AS conteudo_id, c.titulo AS conteudo_titulo
  FROM instagram_midias m
  LEFT JOIN projetos p ON p.id = m.projeto_id
  LEFT JOIN conteudos c ON c.midia_id = m.id`;

const comCapa = (m) => ({ ...m, capa_url: m.capa ? `/uploads/${m.capa}` : null });

export function rotasInstagram({ db, hoje, fetch, sincronizarInstagram }) {
  const projetos = repoProjetos(db);
  const r = Router();

  const estado = () => ({
    conectado: Boolean(obterConfig(db, 'instagram_token')),
    usuario: obterConfig(db, 'instagram_usuario'),
    expira_em: obterConfig(db, 'instagram_token_expira_em'),
    ultima_sync: obterConfig(db, 'instagram_ultima_sync'),
    ultimo_erro: obterConfig(db, 'instagram_ultimo_erro'),
    sincronizando: sincronizarInstagram.emAndamento(),
  });
  const obterMidia = (id) => {
    const m = linha(db.prepare(`${SELECT_MIDIA} WHERE m.id = ?`).get(id));
    if (!m) throw naoEncontrado('Post');
    return comCapa(m);
  };

  r.get('/instagram/estado', (req, res) => res.json(estado()));

  r.put('/instagram/conexao', async (req, res) => {
    const { token } = validar(req.body, { token: { tipo: 'texto', obrigatorio: true } });
    let perfil;
    try {
      perfil = await criarClienteInstagram({ token, fetch }).perfil();
    } catch (erro) {
      // status 0 = nem chegou ao Instagram (sem internet); o token pode estar certo.
      if (erro.status === 0) throw new ErroHttp(502, erro.message);
      throw new ErroValidacao([{ campo: 'token', mensagem: 'Token inválido ou sem permissão' }]);
    }
    definirConfig(db, 'instagram_token', token);
    definirConfig(db, 'instagram_usuario', perfil.username);
    definirConfig(db, 'instagram_token_expira_em', new Date(Date.now() + VALIDADE_TOKEN_MS).toISOString());
    db.prepare("DELETE FROM config WHERE chave = 'instagram_ultimo_erro'").run();
    sincronizarInstagram.reiniciar().catch(() => {}); // o erro fica em instagram_ultimo_erro
    res.json(estado());
  });

  r.delete('/instagram/conexao', (req, res) => {
    const apagar = db.prepare('DELETE FROM config WHERE chave = ?');
    for (const chave of CHAVES_CONEXAO) apagar.run(chave);
    res.status(204).end();
  });

  r.post('/instagram/sincronizar', async (req, res) => {
    try {
      res.json(await sincronizarInstagram.executar());
    } catch (erro) {
      throw new ErroHttp(502, erro.message);
    }
  });

  r.get('/instagram/grid', (req, res) => {
    const prontos = db
      .prepare(`SELECT c.*, p.titulo AS projeto_titulo FROM conteudos c LEFT JOIN projetos p ON p.id = c.projeto_id
        WHERE c.estado = 'pronto' AND c.midia_id IS NULL ORDER BY c.ordem, c.id`)
      .all()
      .map(linha);
    const midias = db.prepare(`${SELECT_MIDIA} WHERE m.removido = 0 ORDER BY m.publicado_em DESC`).all().map(linha).map(comCapa);
    res.json({ prontos, midias });
  });

  r.get('/instagram/midias', (req, res) => {
    const projetoId = Number(req.query.projeto_id);
    const lista = db
      .prepare(`${SELECT_MIDIA} WHERE m.removido = 0 ${req.query.projeto_id ? 'AND m.projeto_id = ?' : ''} ORDER BY m.publicado_em DESC`)
      .all(...(req.query.projeto_id ? [projetoId] : []))
      .map(linha)
      .map(comCapa);
    res.json(lista);
  });

  r.get('/instagram/midias/:id/candidatos', (req, res) => {
    res.json(candidatosManuais(db, obterMidia(req.params.id)));
  });

  r.put('/instagram/midias/:id', (req, res) => {
    obterMidia(req.params.id);
    const { projeto_id = null } = validar(req.body, { projeto_id: { tipo: 'inteiro' } });
    if (projeto_id != null && !projetos.obter(projeto_id)) {
      throw new ErroValidacao([{ campo: 'projeto_id', mensagem: 'Projeto não encontrado' }]);
    }
    db.prepare('UPDATE instagram_midias SET projeto_id = ? WHERE id = ?').run(projeto_id, req.params.id);
    res.json(obterMidia(req.params.id));
  });

  r.post('/instagram/midias/:id/vinculo', (req, res) => {
    obterMidia(req.params.id);
    const { conteudo_id } = validar(req.body, { conteudo_id: { tipo: 'inteiro', obrigatorio: true } });
    vincular(db, conteudo_id, req.params.id);
    res.json(obterMidia(req.params.id));
  });

  r.delete('/instagram/midias/:id/vinculo', (req, res) => {
    obterMidia(req.params.id);
    desvincular(db, req.params.id);
    res.json(obterMidia(req.params.id));
  });

  r.get('/instagram/seguidores', (req, res) => {
    const lista = db
      .prepare('SELECT dia, seguidores FROM instagram_seguidores WHERE dia >= ? ORDER BY dia')
      .all(somarDias(hoje(), -90))
      .map(linha);
    res.json(lista);
  });

  return r;
}
