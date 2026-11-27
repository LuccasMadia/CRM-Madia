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
import { rotasCerebro } from './routes/cerebro.js';
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
import { rotasTabelaPrecos } from './routes/tabelaPrecos.js';
import { rotasOrcamentos } from './routes/orcamentos.js';
import { rotasAgenda } from './routes/agenda.js';
import { rotasGithub } from './routes/github.js';
import { criarServicoGithub } from './github/servico.js';
import { rotasFigma } from './routes/figma.js';
import { criarServicoFigma } from './figma/servico.js';
import { rotasSupabase } from './routes/supabase.js';
import { criarServicoSupabase } from './supabase/servico.js';
import { rotasConexoes } from './routes/conexoes.js';
import { rotasGmail } from './routes/gmail.js';
import { rotasEventos } from './routes/eventos.js';
import { rotasCalendario } from './routes/calendario.js';
import { criarServicoCalendario } from './calendario/servico.js';
import { criarServicoGmail } from './gmail/servico.js';
import { criarServicoConexoes } from './conexoes/servico.js';

export function criarApp({ db, dataDir, hoje = () => hojeLocal(), fetch = globalThis.fetch, distDir, publicador }) {
  const app = express();
  const sincronizarInstagram = criarExecutorUnico(() => sincronizar({ db, dataDir, fetch }));
  publicador ??= criarPublicador({ db, fetch, urlPublica: URL_PUBLICA, sincronizar: () => sincronizarInstagram.reiniciar() });
  const monitorSites = criarMonitor({ db, fetch });
  const github = criarServicoGithub({ db, fetch, hoje });
  const figma = criarServicoFigma({ db, fetch });
  const supabase = criarServicoSupabase({ db, fetch });
  const conexoes = criarServicoConexoes({ db, fetch, hoje });
  const gmail = criarServicoGmail({ db, fetch });
  const calendario = criarServicoCalendario({ db, fetch, hoje });
  const ctx = { db, dataDir, hoje, fetch, sincronizarInstagram, publicador, github, figma, supabase, conexoes, gmail, calendario };
  app.locals.monitorSites = monitorSites;
  app.locals.sincronizarInstagram = sincronizarInstagram;
  app.locals.publicador = publicador;
  app.locals.github = github;
  app.locals.calendario = calendario;
  // Única rota sem proteção de host (Cloudflare Access libera /publico/*): precisa vir antes do protegerLocal.
  app.use('/publico', rotasPublico(ctx));
  app.use(protegerLocal);
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/clientes', rotasClientes(ctx));
  app.use('/api/projetos', rotasProjetos(ctx));
  app.use('/api/categorias', rotasCategorias(ctx));
  app.use('/api/nichos', rotasNichos(ctx));
  app.use('/api/ferramentas', rotasFerramentas(ctx));
  app.use('/api/tabela-precos', rotasTabelaPrecos(ctx));
  app.use('/api', rotasOrcamentos(ctx));
  app.use('/api', rotasParcelas(ctx));
  app.use('/api', rotasTarefas(ctx));
  app.use('/api', rotasConteudos(ctx));
  app.use('/api', rotasPainel(ctx));
  app.use('/api', rotasCerebro(ctx));
  app.use('/api', rotasPortfolio(ctx));
  app.use('/api', rotasPublicacao(ctx));
  app.use('/api', rotasBackup(ctx));
  app.use('/api', rotasPlacas(ctx));
  app.use('/api', rotasInstagram(ctx));
  app.use('/api', rotasHospedagem(ctx));
  app.use('/api', rotasAgenda(ctx));
  app.use('/api', rotasGithub(ctx));
  app.use('/api', rotasFigma(ctx));
  app.use('/api', rotasSupabase(ctx));
  app.use('/api', rotasConexoes(ctx));
  app.use('/api', rotasGmail(ctx));
  app.use('/api', rotasEventos(ctx));
  app.use('/api', rotasCalendario(ctx));
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
