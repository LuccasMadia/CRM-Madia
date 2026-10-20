import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { hojeLocal } from './domain/datas.js';
import { tratarErros } from './http/erros.js';
import { protegerLocal, URL_PUBLICA } from './http/protecao.js';
import { criarPublicador } from './instagram/publicador.js';
import { rotasClientes } from './routes/clientes.js';
import { rotasProjetos } from './routes/projetos.js';
import { rotasParcelas } from './routes/parcelas.js';
import { rotasTarefas } from './routes/tarefas.js';
import { rotasConteudos } from './routes/conteudos.js';
import { rotasPainel } from './routes/painel.js';
import { rotasPortfolio } from './routes/portfolio.js';
import { rotasPublicacao } from './routes/publicacao.js';
import { rotasBackup } from './routes/backup.js';
import { rotasPlacas } from './routes/placas.js';
import { rotasInstagram } from './routes/instagram.js';
import { rotasPublico } from './routes/publico.js';
import { sincronizar } from './instagram/sync.js';
import { criarExecutorUnico } from './instagram/executor.js';
import { criarMonitor } from './hospedagem/monitor.js';
import { rotasHospedagem } from './routes/hospedagem.js';
import { rotasCategorias, rotasNichos } from './routes/cadastros.js';
import { rotasFerramentas } from './routes/ferramentas.js';

export function criarApp({ db, dataDir, hoje = () => hojeLocal(), fetch = globalThis.fetch, distDir, publicador }) {
  const app = express();
  const sincronizarInstagram = criarExecutorUnico(() => sincronizar({ db, dataDir, fetch }));
  publicador ??= criarPublicador({ db, fetch, urlPublica: URL_PUBLICA, sincronizar: () => sincronizarInstagram.reiniciar() });
  const monitorSites = criarMonitor({ db, fetch });
  const ctx = { db, dataDir, hoje, fetch, sincronizarInstagram, publicador };
  app.locals.monitorSites = monitorSites;
  app.locals.sincronizarInstagram = sincronizarInstagram;
  app.locals.publicador = publicador;
  // Única rota sem proteção de host (Cloudflare Access libera /publico/*): precisa vir antes do protegerLocal.
  app.use('/publico', rotasPublico(ctx));
  app.use(protegerLocal);
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/clientes', rotasClientes(ctx));
  app.use('/api/projetos', rotasProjetos(ctx));
  app.use('/api/categorias', rotasCategorias(ctx));
  app.use('/api/nichos', rotasNichos(ctx));
  app.use('/api/ferramentas', rotasFerramentas(ctx));
  app.use('/api', rotasParcelas(ctx));
  app.use('/api', rotasTarefas(ctx));
  app.use('/api', rotasConteudos(ctx));
  app.use('/api', rotasPainel(ctx));
  app.use('/api', rotasPortfolio(ctx));
  app.use('/api', rotasPublicacao(ctx));
  app.use('/api', rotasBackup(ctx));
  app.use('/api', rotasPlacas(ctx));
  app.use('/api', rotasInstagram(ctx));
  app.use('/api', rotasHospedagem(ctx));
  app.use('/uploads', express.static(path.join(dataDir, 'uploads')));

  app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada' }));

  // Front compilado (produção): estáticos + index.html para as rotas do React.
  if (distDir && existsSync(distDir)) {
    app.use(express.static(distDir));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || /^\/(api|uploads|publico)(\/|$)/.test(req.path)) return next();
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.use(tratarErros);
  return app;
}
