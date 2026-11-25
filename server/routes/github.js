import { Router } from 'express';
import { definirConfig } from '../repos/config.js';
import { repoProjetos } from '../repos/projetos.js';
import { validar, lerId } from '../http/validar.js';
import { ErroHttp, ErroValidacao, naoEncontrado } from '../http/erros.js';
import { criarClienteGithub, ErroGithub } from '../github/cliente.js';

const MSG_SEM_TOKEN = 'Conecte o GitHub em Configurações.';

export function rotasGithub({ db, fetch, github }) {
  const projetos = repoProjetos(db);
  const r = Router();

  const exigirConexao = () => { if (!github.estado().conectado) throw new ErroHttp(409, MSG_SEM_TOKEN); };
  const falha = (erro) => (erro instanceof ErroGithub ? new ErroHttp(502, erro.message) : erro);
  const forcar = (req) => req.query.atualizar === '1';
  function obterProjeto(valor) {
    const projeto = projetos.obter(lerId(valor));
    if (!projeto) throw naoEncontrado('Projeto');
    return projeto;
  }

  r.get('/github', (req, res) => res.json(github.estado()));

  r.put('/github/conexao', async (req, res) => {
    const { token } = validar(req.body, { token: { tipo: 'texto', obrigatorio: true } });
    let usuario;
    try {
      usuario = await criarClienteGithub({ token, fetch }).usuario();
    } catch (erro) {
      if (erro.tokenInvalido) throw new ErroValidacao([{ campo: 'token', mensagem: 'Token inválido ou sem permissão' }]);
      throw falha(erro);
    }
    definirConfig(db, 'github_token', token);
    definirConfig(db, 'github_usuario', usuario);
    github.limparCache();
    res.json(github.estado());
  });

  r.delete('/github/conexao', (req, res) => {
    db.prepare("DELETE FROM config WHERE chave IN ('github_token', 'github_usuario')").run();
    github.limparCache();
    res.json(github.estado());
  });

  r.get('/github/repositorios', async (req, res) => {
    exigirConexao();
    try {
      res.json(await github.auditoria({ forcar: forcar(req) }));
    } catch (erro) {
      throw falha(erro);
    }
  });

  // Leve e à prova de falha: alimenta a faixa "Pede atenção", que não deve mostrar erro do GitHub.
  r.get('/github/atencao', async (req, res) => {
    if (!github.estado().conectado) return res.json({ alertas: [] });
    try {
      res.json({ alertas: (await github.auditoria()).alertas });
    } catch {
      res.json({ alertas: [] });
    }
  });

  r.get('/projetos/:id/github', async (req, res) => {
    const projeto = obterProjeto(req.params.id);
    exigirConexao();
    try {
      res.json(await github.detalheProjeto(projeto, { forcar: forcar(req) }));
    } catch (erro) {
      throw falha(erro);
    }
  });

  r.post('/projetos/:id/github', async (req, res) => {
    const projeto = obterProjeto(req.params.id);
    exigirConexao();
    if (projeto.github_repo) throw new ErroHttp(409, 'Este projeto já tem repositório.');
    const resultado = await github.garantirRepositorio(projeto.id);
    if (resultado.erro) throw new ErroHttp(502, resultado.erro);
    try {
      res.json(await github.detalheProjeto(obterProjeto(projeto.id)));
    } catch (erro) {
      throw falha(erro);
    }
  });

  return r;
}
