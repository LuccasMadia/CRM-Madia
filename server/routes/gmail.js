import { Router } from 'express';
import { validar, lerId } from '../http/validar.js';
import { ErroHttp, naoEncontrado } from '../http/erros.js';
import { ErroGmail } from '../gmail/cliente.js';

export function rotasGmail({ db, gmail }) {
  const r = Router();
  const falha = (erro) => (erro instanceof ErroGmail ? new ErroHttp(502, erro.message) : erro);

  r.get('/gmail', (req, res) => res.json(gmail.estado()));

  r.put('/gmail/credenciais', (req, res) => {
    const dados = validar(req.body, { client_id: { tipo: 'texto', obrigatorio: true }, client_secret: { tipo: 'texto', obrigatorio: true } });
    gmail.salvarCredenciais(dados);
    res.json(gmail.estado());
  });

  r.get('/gmail/autorizar', (req, res) => res.redirect(gmail.iniciar()));

  r.get('/gmail/callback', async (req, res) => {
    try {
      await gmail.concluir({ codigo: String(req.query.code ?? ''), state: String(req.query.state ?? '') });
    } catch (erro) {
      throw falha(erro);
    }
    res.redirect('/configuracoes');
  });

  r.delete('/gmail/conexao', async (req, res) => {
    await gmail.desconectar();
    res.json(gmail.estado());
  });

  r.get('/clientes/:id/emails', async (req, res) => {
    const cliente = db.prepare('SELECT id, email FROM clientes WHERE id = ?').get(lerId(req.params.id));
    if (!cliente) throw naoEncontrado('Cliente');
    if (!gmail.estado().conectado) throw new ErroHttp(409, 'Conecte o Gmail em Configurações.');
    try {
      res.json(await gmail.emailsDoCliente(cliente, { forcar: req.query.atualizar === '1' }));
    } catch (erro) {
      throw falha(erro);
    }
  });

  return r;
}
