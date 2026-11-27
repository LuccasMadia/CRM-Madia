import { Router } from 'express';
import { validar } from '../http/validar.js';
import { ErroValidacao } from '../http/erros.js';

export function rotasCalendario({ calendario }) {
  const r = Router();

  r.get('/calendario', (req, res) => res.json(calendario.estado()));

  r.put('/calendario/conexao', async (req, res) => {
    await calendario.conectar(validar(req.body, { usuario: { tipo: 'texto', obrigatorio: true }, senha: { tipo: 'texto', obrigatorio: true } }));
    res.json(calendario.estado());
  });

  r.delete('/calendario/conexao', (req, res) => {
    calendario.desconectar();
    res.json(calendario.estado());
  });

  r.get('/calendario/calendarios', async (req, res) => res.json(await calendario.calendarios()));

  r.put('/calendario/calendario', async (req, res) => {
    const dados = validar(req.body, { href: { tipo: 'texto' }, criar: { tipo: 'texto' } }, { parcial: true });
    if (!dados.href && !dados.criar) throw new ErroValidacao([{ campo: 'href', mensagem: 'Escolha um calendário ou peça para criar um' }]);
    await calendario.escolher(dados);
    res.json(calendario.estado());
  });

  r.post('/calendario/sincronizar', async (req, res) => res.json(await calendario.sincronizar()));

  return r;
}
