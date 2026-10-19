import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { obterConfig, definirConfig } from '../repos/config.js';
import { hojeLocal } from '../domain/datas.js';
import { criarClienteInstagram, ErroInstagram } from './cliente.js';
import { tipoDaMidia } from './legenda.js';
import { desvincular, migrarLegado, vincular, vincularAutomatico } from './vinculo.js';

const DIA_MS = 24 * 60 * 60 * 1000;
const RENOVAR_ANTES_MS = 15 * DIA_MS;
const JANELA_MS = 60 * DIA_MS;
const MENSAGEM_TOKEN = 'O acesso ao Instagram expirou. Reconecte em Configurações.';

export async function sincronizar({ db, dataDir, fetch = globalThis.fetch, agora = () => new Date() }) {
  // Se o Lucca desconectar ou trocar o token no meio, esta sync não mexe mais
  // na conexão: não grava token renovado, usuário, data da sync nem erro.
  const sessao = { token: obterConfig(db, 'instagram_token') };
  const vigente = () => sessao.token !== null && obterConfig(db, 'instagram_token') === sessao.token;
  try {
    const resultado = await executar({ db, dataDir, fetch, agora, sessao, vigente });
    if (vigente()) {
      definirConfig(db, 'instagram_ultima_sync', agora().toISOString());
      db.prepare("DELETE FROM config WHERE chave = 'instagram_ultimo_erro'").run();
    }
    return resultado;
  } catch (erro) {
    const mensagem = erro.tokenInvalido ? MENSAGEM_TOKEN : erro.message;
    if (vigente()) definirConfig(db, 'instagram_ultimo_erro', mensagem);
    throw erro.tokenInvalido ? new ErroInstagram(mensagem, { status: erro.status, tokenInvalido: true }) : erro;
  }
}

async function executar({ db, dataDir, fetch, agora, sessao, vigente }) {
  if (!sessao.token) throw new ErroInstagram('Instagram não conectado');

  const expiraEm = obterConfig(db, 'instagram_token_expira_em');
  if (expiraEm && Date.parse(expiraEm) - agora().getTime() < RENOVAR_ANTES_MS) {
    try {
      const renovado = await criarClienteInstagram({ token: sessao.token, fetch, agora }).renovarToken();
      if (vigente()) {
        sessao.token = renovado.token;
        definirConfig(db, 'instagram_token', renovado.token);
        definirConfig(db, 'instagram_token_expira_em', renovado.expiraEm);
      }
    } catch {
      // Segue com o token atual; a renovação é tentada de novo na próxima sync.
    }
  }
  const ig = criarClienteInstagram({ token: sessao.token, fetch, agora });

  const perfil = await ig.perfil();
  if (vigente()) definirConfig(db, 'instagram_usuario', perfil.username);
  db.prepare('INSERT OR REPLACE INTO instagram_seguidores (dia, seguidores) VALUES (?, ?)').run(hojeLocal(agora()), perfil.followers_count);

  // Só conta como já sincronizado quando uma sync completa desta conta terminou;
  // assim uma primeira sync interrompida ou uma troca de conta busca tudo de novo.
  const primeira = obterConfig(db, 'instagram_sync_completa') !== perfil.id;
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
      alcance = COALESCE(excluded.alcance, instagram_midias.alcance), visualizacoes = COALESCE(excluded.visualizacoes, instagram_midias.visualizacoes), salvamentos = COALESCE(excluded.salvamentos, instagram_midias.salvamentos),
      compartilhamentos = COALESCE(excluded.compartilhamentos, instagram_midias.compartilhamentos), removido = 0, atualizado_em = excluded.atualizado_em`);

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

  // Lista vazia com a conta tendo posts costuma ser falha passageira da API:
  // não marca nada como removido para não desfazer vínculos.
  const respostaSuspeita = recebidas.length === 0 && perfil.media_count > 0;
  const vistas = new Set(recebidas.map((m) => m.id));
  const naJanela = respostaSuspeita ? [] : db
    .prepare('SELECT id FROM instagram_midias WHERE removido = 0 AND publicado_em >= ?')
    .all(desde ?? '')
    .filter((m) => !vistas.has(m.id));
  for (const { id } of naJanela) {
    db.prepare('UPDATE instagram_midias SET removido = 1 WHERE id = ?').run(id);
    desvincular(db, id);
  }

  await baixarCapasPendentes(db, dataDir, fetch, ig, vistas);
  ligarPublicados(db);
  for (const midia of novas) vincularAutomatico(db, midia);
  migrarLegado(db);
  if (vigente()) definirConfig(db, 'instagram_sync_completa', perfil.id);
  return { novas: novas.length, atualizadas: recebidas.length - novas.length };
}

// Posts publicados pelo CRM: o id da mídia já é conhecido, então liga direto
// (antes do vínculo por legenda, que poderia escolher outro planejado).
function ligarPublicados(db) {
  const pendentes = db.prepare(`
    SELECT c.id, c.publicacao_midia_id AS midia FROM conteudos c
    JOIN instagram_midias m ON m.id = c.publicacao_midia_id
    WHERE c.midia_id IS NULL AND m.removido = 0`).all();
  for (const { id, midia } of pendentes) {
    try {
      vincular(db, id, midia);
    } catch {
      // Mídia já ligada a outro planejado à mão: respeita a escolha do Lucca.
    }
  }
}

// Capas que falharam em syncs anteriores, inclusive de posts fora da janela.
async function baixarCapasPendentes(db, dataDir, fetch, ig, jaTentadas) {
  const pendentes = db.prepare('SELECT id FROM instagram_midias WHERE capa IS NULL AND removido = 0').all();
  for (const { id } of pendentes) {
    if (jaTentadas.has(id)) continue;
    const m = await ig.midia(id).catch(() => null);
    if (m) await baixarCapaSeFaltar(db, dataDir, fetch, m);
  }
}

// As URLs de mídia da Meta expiram; a capa é guardada localmente uma vez.
async function baixarCapaSeFaltar(db, dataDir, fetch, m) {
  if (db.prepare('SELECT capa FROM instagram_midias WHERE id = ?').get(m.id).capa) return;
  const fonte = m.media_type === 'CAROUSEL_ALBUM' ? (m.children?.data?.[0] ?? m) : m;
  const url = fonte.media_type === 'VIDEO' ? fonte.thumbnail_url : fonte.media_url;
  if (!url) return;
  try {
    const resposta = await fetch(url);
    if (!resposta.ok || resposta.headers.get('content-type')?.startsWith('video/')) return;
    const pasta = path.join(dataDir, 'uploads', 'instagram');
    mkdirSync(pasta, { recursive: true });
    writeFileSync(path.join(pasta, `${m.id}.jpg`), Buffer.from(await resposta.arrayBuffer()));
    db.prepare('UPDATE instagram_midias SET capa = ? WHERE id = ?').run(`instagram/${m.id}.jpg`, m.id);
  } catch {
    // Sem capa por agora; a próxima sync tenta de novo.
  }
}
