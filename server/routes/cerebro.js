import { Router } from 'express';
import { gerarTodasMensalidades } from '../repos/mensalidades.js';
import { montarRelatorioProjetos } from '../cerebro/relatorio.js';

export function rotasCerebro({ db, hoje }) {
  const r = Router();

  r.get('/cerebro/projetos', (req, res) => {
    gerarTodasMensalidades(db, hoje());
    res.json(montarRelatorioProjetos(db, hoje()));
  });

  return r;
}
