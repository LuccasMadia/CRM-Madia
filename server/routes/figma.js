import { Router } from 'express';
import { definirConfig } from '../repos/config.js';
import { repoProjetos } from '../repos/projetos.js';
import { validar, lerId } from '../http/validar.js';
import { ErroHttp, ErroValidacao, naoEncontrado } from '../http/erros.js';
import { criarClienteFigma, ErroFigma } from '../figma/cliente.js';

export function rotasFigma({ db, fetch, figma }) {
  const projetos = repoProjetos(db);
  const r = Router();
  const falha = (erro) => (erro instanceof ErroFigma ? new ErroHttp(502, erro.message) : erro);

  r.get('/figma', (req, res) => res.json(figma.estado()));

  r.put('/figma/conexao', async (req, res) => {
    const { token } = validar(req.body, { token: { tipo: 'texto', obrigatorio: true } });
    let usuario;
    try {
      usuario = await criarClienteFigma({ token, fetch }).usuario();
    } catch (erro) {
      if (erro.tokenInvalido) throw new ErroValidacao([{ campo: 'token', mensagem: 'Token inválido ou sem permissão' }]);
      throw falha(erro);
    }
    definirConfig(db, 'figma_token', token);
    definirConfig(db, 'figma_usuario', usuario);
    figma.limparCache();
    res.json(figma.estado());
  });

  r.delete('/figma/conexao', (req, res) => {
    db.prepare("DELETE FROM config WHERE chave IN ('figma_token', 'figma_usuario')").run();
    figma.limparCache();
    res.json(figma.estado());
  });

  r.get('/projetos/:id/figma', async (req, res) => {
    const projeto = projetos.obter(lerId(req.params.id));
    if (!projeto) throw naoEncontrado('Projeto');
    if (!figma.estado().conectado) throw new ErroHttp(409, 'Conecte o Figma em Configurações.');
    try {
      res.json(await figma.detalheProjeto(projeto, { forcar: req.query.atualizar === '1' }));
    } catch (erro) {
      throw falha(erro);
    }
  });

  return r;
}
