import express from 'express';
import path from 'node:path';
import { hojeLocal } from './domain/datas.js';
import { tratarErros } from './http/erros.js';
import { protegerLocal } from './http/protecao.js';
import { rotasClientes } from './routes/clientes.js';
import { rotasProjetos } from './routes/projetos.js';
import { rotasParcelas } from './routes/parcelas.js';
import { rotasTarefas } from './routes/tarefas.js';
import { rotasConteudos } from './routes/conteudos.js';
import { rotasPainel } from './routes/painel.js';
import { rotasPortfolio } from './routes/portfolio.js';
import { rotasPublicacao } from './routes/publicacao.js';
import { rotasBackup } from './routes/backup.js';

export function criarApp({ db, dataDir, hoje = () => hojeLocal() }) {
  const app = express();
  const ctx = { db, dataDir, hoje };
  app.use(protegerLocal);
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/clientes', rotasClientes(ctx));
  app.use('/api/projetos', rotasProjetos(ctx));
  app.use('/api', rotasParcelas(ctx));
  app.use('/api', rotasTarefas(ctx));
  app.use('/api', rotasConteudos(ctx));
  app.use('/api', rotasPainel(ctx));
  app.use('/api', rotasPortfolio(ctx));
  app.use('/api', rotasPublicacao(ctx));
  app.use('/api', rotasBackup(ctx));
  app.use('/uploads', express.static(path.join(dataDir, 'uploads')));

  app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada' }));
  app.use(tratarErros);
  return app;
}
