import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { obterConfig, definirConfig } from '../repos/config.js';
import { hojeLocal } from '../domain/datas.js';
import { criarClienteInstagram, ErroInstagram } from './cliente.js';
import { tipoDaMidia } from './legenda.js';
import { desvincular, migrarLegado, vincularAutomatico } from './vinculo.js';

const DIA_MS = 24 * 60 * 60 * 1000;
const RENOVAR_ANTES_MS = 15 * DIA_MS;
const JANELA_MS = 60 * DIA_MS;
const MENSAGEM_TOKEN = 'O acesso ao Instagram expirou. Reconecte em Configurações.';

export async function sincronizar({ db, dataDir, fetch = globalThis.fetch, agora = () => new Date() }) {
  try {
    const resultado = await executar({ db, dataDir, fetch, agora });
    definirConfig(db, 'instagram_ultima_sync', agora().toISOString());
    db.prepare("DELETE FROM config WHERE chave = 'instagram_ultimo_erro'").run();
    return resultado;
  } catch (erro) {
    const mensagem = erro.tokenInvalido ? MENSAGEM_TOKEN : erro.message;
    definirConfig(db, 'instagram_ultimo_erro', mensagem);
    throw erro.tokenInvalido ? new ErroInstagram(mensagem, { status: erro.status, tokenInvalido: true }) : erro;
  }
}

async function executar({ db, dataDir, fetch, agora }) {
  let token = obterConfig(db, 'instagram_token');
  if (!token) throw new ErroInstagram('Instagram não conectado');

  const expiraEm = obterConfig(db, 'instagram_token_expira_em');
  if (expiraEm && Date.parse(expiraEm) - agora().getTime() < RENOVAR_ANTES_MS) {
    const renovado = await criarClienteInstagram({ token, fetch, agora }).renovarToken();
    token = renovado.token;
    definirConfig(db, 'instagram_token', token);
    definirConfig(db, 'instagram_token_expira_em', renovado.expiraEm);
  }
  const ig = criarClienteInstagram({ token, fetch, agora });

  const perfil = await ig.perfil();
  definirConfig(db, 'instagram_usuario', perfil.username);
  db.prepare('INSERT OR REPLACE INTO instagram_seguidores (dia, seguidores) VALUES (?, ?)').run(hojeLocal(agora()), perfil.followers_count);

  const primeira = db.prepare('SELECT COUNT(*) AS n FROM instagram_midias').get().n === 0;
  if (primeira) {
    const historico = db.prepare('INSERT OR IGNORE INTO instagram_seguidores (dia, seguidores) VALUES (?, ?)');
    for (const { dia, seguidores } of await ig.historicoSeguidores(perfil.followers_count)) historico.run(dia, seguidores);
  }

  const desde = primeira ? null : new Date(agora().getTime() - JANELA_MS).toISOString();
  const recebidas = await ig.midias(desde ? { desde } : {});
  const existentes = new Set(db.prepare('SELECT id FROM instagram_midias').all().map((m) => m.id));
  const salvar = db.prepare(`
    INSERT INTO instagram_midias (id, tipo, legenda, permalink, publicado_em, curtidas, comentarios,
      alcance, visualizacoes, salvamentos, compartilhamentos, removido, atualizado_em)
    VALUES (@id, @tipo, @legenda, @permalink, @publicado_em, @curtidas, @comentarios,
      @alcance, @visualizacoes, @salvamentos, @compartilhamentos, 0, @atualizado_em)
    ON CONFLICT(id) DO UPDATE SET tipo = excluded.tipo, legenda = excluded.legenda, permalink = excluded.permalink,
      publicado_em = excluded.publicado_em, curtidas = excluded.curtidas, comentarios = excluded.comentarios,
      alcance = excluded.alcance, visualizacoes = excluded.visualizacoes, salvamentos = excluded.salvamentos,
      compartilhamentos = excluded.compartilhamentos, removido = 0, atualizado_em = excluded.atualizado_em`);

  const novas = [];
  for (const m of recebidas) {
    const registro = {
      id: m.id,
      tipo: tipoDaMidia(m),
      legenda: m.caption ?? null,
      permalink: m.permalink ?? null,
      publicado_em: new Date(m.timestamp).toISOString(),
      curtidas: m.like_count ?? null,
      comentarios: m.comments_count ?? null,
      ...(await ig.insights(m.id)),
      atualizado_em: agora().toISOString(),
    };
    salvar.run(registro);
    await baixarCapaSeFaltar(db, dataDir, fetch, m);
    if (!existentes.has(m.id)) novas.push(registro);
  }

  const vistas = new Set(recebidas.map((m) => m.id));
  const naJanela = db
    .prepare('SELECT id FROM instagram_midias WHERE removido = 0 AND publicado_em >= ?')
    .all(desde ?? '')
    .filter((m) => !vistas.has(m.id));
  for (const { id } of naJanela) {
    db.prepare('UPDATE instagram_midias SET removido = 1 WHERE id = ?').run(id);
    desvincular(db, id);
  }

  for (const midia of novas) vincularAutomatico(db, midia);
  migrarLegado(db);
  return { novas: novas.length, atualizadas: recebidas.length - novas.length };
}

// As URLs de mídia da Meta expiram; a capa é guardada localmente uma vez.
async function baixarCapaSeFaltar(db, dataDir, fetch, m) {
  if (db.prepare('SELECT capa FROM instagram_midias WHERE id = ?').get(m.id).capa) return;
  const url = m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url;
  if (!url) return;
  try {
    const resposta = await fetch(url);
    if (!resposta.ok) return;
    const pasta = path.join(dataDir, 'uploads', 'instagram');
    mkdirSync(pasta, { recursive: true });
    writeFileSync(path.join(pasta, `${m.id}.jpg`), Buffer.from(await resposta.arrayBuffer()));
    db.prepare('UPDATE instagram_midias SET capa = ? WHERE id = ?').run(`instagram/${m.id}.jpg`, m.id);
  } catch {
    // Sem capa por agora; a próxima sync tenta de novo.
  }
}
