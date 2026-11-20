import { Router } from 'express';
import { URL_PUBLICA } from '../http/protecao.js';
import { tokenAgenda, gerarTokenAgenda, desligarAgenda } from '../agenda/agenda.js';

// Conexão com Google/Apple Agenda: um link privado (ICS) que as duas assinam. O arquivo em si sai em /publico/agenda.
export function rotasAgenda({ db }) {
  const r = Router();
  const estado = () => {
    const token = tokenAgenda(db);
    return { ativo: Boolean(token), url: token ? `${URL_PUBLICA}/publico/agenda/${token}.ics` : null };
  };
  r.get('/agenda', (req, res) => res.json(estado()));
  // gerar de novo invalida o link antigo
  r.post('/agenda', (req, res) => { gerarTokenAgenda(db); res.json(estado()); });
  r.delete('/agenda', (req, res) => { desligarAgenda(db); res.json(estado()); });
  return r;
}
