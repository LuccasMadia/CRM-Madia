import { Router } from 'express';
import { validar } from '../http/validar.js';

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

  // Quais calendários aparecem na tela (todos continuam sincronizando).
  r.put('/calendario/ocultos', (req, res) => {
    calendario.esconder(req.body?.ocultos);
    res.json(calendario.estado());
  });

  // Onde cai o evento novo quando não se escolhe o calendário.
  r.put('/calendario/padrao', (req, res) => {
    calendario.definirPadrao(validar(req.body, { href: { tipo: 'texto', obrigatorio: true } }).href);
    res.json(calendario.estado());
  });

  r.post('/calendario/calendarios', async (req, res) => {
    await calendario.criarCalendario(validar(req.body, { nome: { tipo: 'texto', obrigatorio: true } }));
    res.json(calendario.estado());
  });

  r.post('/calendario/sincronizar', async (req, res) => res.json(await calendario.sincronizar()));

  return r;
}
