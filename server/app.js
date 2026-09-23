import express from 'express';
import { hojeLocal } from './domain/datas.js';
import { tratarErros } from './http/erros.js';
import { rotasClientes } from './routes/clientes.js';
import { rotasProjetos } from './routes/projetos.js';

export function criarApp({ db, dataDir, hoje = () => hojeLocal() }) {
  const app = express();
  const ctx = { db, dataDir, hoje };
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/clientes', rotasClientes(ctx));
  app.use('/api/projetos', rotasProjetos(ctx));

  app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada' }));
  app.use(tratarErros);
  return app;
}
