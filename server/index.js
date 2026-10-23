import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db/connection.js';
import { criarApp } from './app.js';
import { obterConfig } from './repos/config.js';
import { iniciarPeriodico } from './instagram/executor.js';
import { verificarAgendados } from './instagram/agendador.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.CRM_DATA_DIR ?? path.join(raiz, 'data');
// CRM_PORTA_API permite subir uma segunda API (ex.: com uma cópia do banco) sem brigar com a do pm2.
const PORTA = Number(process.env.CRM_PORTA_API) || 5174;

const db = openDb(path.join(dataDir, 'crm.db'));
const app = criarApp({ db, dataDir, distDir: path.join(raiz, 'dist') });
app.listen(PORTA, '127.0.0.1', () => {
  console.log(`API do CRM em http://127.0.0.1:${PORTA}`);
  // Sincroniza o Instagram ao subir e a cada 6 horas, só se estiver conectado.
  iniciarPeriodico(() => obterConfig(db, 'instagram_token') && app.locals.sincronizarInstagram.executar());

  const { publicador } = app.locals;
  // Não se aguarda retomar(): ela só termina quando as publicações em curso acabam (podem levar minutos).
  try {
    publicador.retomar().catch((erro) => console.error('[publicador] retomar falhou:', erro));
  } catch (erro) {
    console.error('[publicador] retomar falhou:', erro);
  }
  const verificarAgendadosSeguro = () => {
    try {
      verificarAgendados({ db, publicador });
    } catch (erro) {
      console.error('[agendador] verificação falhou:', erro);
    }
  };
  verificarAgendadosSeguro();
  setInterval(verificarAgendadosSeguro, 60_000);

  const checarSitesSeguro = () => {
    try {
      app.locals.monitorSites.checarTodos().catch((erro) => console.error('[monitor] checagem falhou:', erro));
    } catch (erro) {
      console.error('[monitor] checagem falhou:', erro);
    }
  };
  checarSitesSeguro();
  setInterval(checarSitesSeguro, 5 * 60_000);
});
