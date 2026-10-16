import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../db/connection.js';
import { definirConfig, obterConfig } from '../repos/config.js';
import { fetchFalso } from '../test/instagramFalso.js';
import { sincronizar } from './sync.js';

const AGORA = new Date('2026-10-16T15:00:00.000Z');
const PNG = new Uint8Array([1, 2, 3]);
let db;
let dataDir;

function rotasPadrao(extra = {}) {
  return {
    '/me': { user_id: '178', username: 'luccasmadia', followers_count: 1284, media_count: 2 },
    '/me/insights': { data: [] },
    '/me/media': {
      data: [
        { id: 'm1', caption: 'Reels Popy', media_type: 'VIDEO', media_product_type: 'REELS', thumbnail_url: 'https://cdn.test/m1.jpg', permalink: 'https://www.instagram.com/reel/m1/', timestamp: '2026-10-10T15:00:00+0000', like_count: 134, comments_count: 12 },
        { id: 'm2', caption: 'Placa', media_type: 'IMAGE', media_product_type: 'FEED', media_url: 'https://cdn.test/m2.jpg', permalink: 'https://www.instagram.com/p/m2/', timestamp: '2026-10-01T15:00:00+0000', like_count: 50, comments_count: 3 },
      ],
    },
    '/m1/insights': { data: [{ name: 'reach', values: [{ value: 1870 }] }, { name: 'saved', values: [{ value: 21 }] }] },
    '/m2/insights': { data: [{ name: 'reach', values: [{ value: 400 }] }] },
    'https://cdn.test/m1.jpg': { status: 200, corpo: PNG },
    'https://cdn.test/m2.jpg': { status: 200, corpo: PNG },
    '/refresh_access_token': { access_token: 'novo', expires_in: 5184000 },
    ...extra,
  };
}
const rodar = (rotas, agora = AGORA) => {
  const falso = fetchFalso(rotas);
  return { falso, promessa: sincronizar({ db, dataDir, fetch: falso.fetch, agora: () => agora }) };
};
const midia = (id) => ({ ...db.prepare('SELECT * FROM instagram_midias WHERE id = ?').get(id) });

beforeEach(() => {
  db = openDb(':memory:');
  dataDir = mkdtempSync(path.join(os.tmpdir(), 'crm-sync-'));
  definirConfig(db, 'instagram_token', 'tok');
  definirConfig(db, 'instagram_token_expira_em', '2026-12-15T00:00:00.000Z');
});

describe('sincronizar', () => {
  it('primeira sync grava mídias, capas, números e seguidores do dia', async () => {
    const { promessa } = rodar(rotasPadrao());
    expect(await promessa).toEqual({ novas: 2, atualizadas: 0 });
    expect(midia('m1')).toMatchObject({
      tipo: 'reels', legenda: 'Reels Popy', permalink: 'https://www.instagram.com/reel/m1/', publicado_em: '2026-10-10T15:00:00.000Z',
      curtidas: 134, comentarios: 12, alcance: 1870, salvamentos: 21, visualizacoes: null, removido: 0, capa: 'instagram/m1.jpg',
    });
    expect(existsSync(path.join(dataDir, 'uploads', 'instagram', 'm1.jpg'))).toBe(true);
    expect({ ...db.prepare('SELECT * FROM instagram_seguidores').get() }).toEqual({ dia: '2026-10-16', seguidores: 1284 });
    expect(obterConfig(db, 'instagram_usuario')).toBe('luccasmadia');
    expect(obterConfig(db, 'instagram_ultima_sync')).toBe(AGORA.toISOString());
  });

  it('capa que falha fica nula e é tentada de novo na próxima sync', async () => {
    await rodar(rotasPadrao({ 'https://cdn.test/m2.jpg': { status: 404, corpo: {} } })).promessa;
    expect(midia('m2').capa).toBeNull();
    const { promessa } = rodar(rotasPadrao());
    expect(await promessa).toEqual({ novas: 0, atualizadas: 2 });
    expect(midia('m2').capa).toBe('instagram/m2.jpg');
  });

  it('insights com erro deixam números nulos sem parar a sync', async () => {
    await rodar(rotasPadrao({ '/m1/insights': { status: 400, corpo: { error: { code: 100 } } } })).promessa;
    expect(midia('m1').alcance).toBeNull();
    expect(midia('m2').alcance).toBe(400);
  });

  it('mídia que sumiu do Instagram é marcada como removida e desvinculada', async () => {
    await rodar(rotasPadrao()).promessa;
    db.exec("INSERT INTO conteudos (tipo, titulo, estado, midia_id, criado_em, atualizado_em) VALUES ('post', 'P', 'pronto', 'm2', 'x', 'x')");
    const rotas = rotasPadrao();
    rotas['/me/media'] = { data: [rotas['/me/media'].data[0]] };
    await rodar(rotas).promessa;
    expect(midia('m2').removido).toBe(1);
    expect(db.prepare("SELECT midia_id FROM conteudos WHERE titulo = 'P'").get().midia_id).toBeNull();
  });

  it('syncs seguintes só olham os últimos 60 dias e não removem as antigas', async () => {
    await rodar(rotasPadrao()).promessa;
    const depois = new Date('2026-12-05T15:00:00.000Z');
    const recente = { id: 'm3', caption: 'Nova', media_type: 'IMAGE', media_product_type: 'FEED', timestamp: '2026-12-01T10:00:00+0000' };
    const { falso, promessa } = rodar(rotasPadrao({ '/me/media': { data: [recente] } }), depois);
    await promessa;
    expect(midia('m2').removido).toBe(0);
    expect(midia('m1').removido).toBe(1);
    expect(falso.chamadas.some((u) => u.pathname === '/me/insights')).toBe(false);
  });

  it('renova o token quando faltam menos de 15 dias', async () => {
    definirConfig(db, 'instagram_token_expira_em', '2026-10-26T00:00:00.000Z');
    const { falso, promessa } = rodar(rotasPadrao());
    await promessa;
    expect(falso.chamadas.some((u) => u.pathname === '/refresh_access_token')).toBe(true);
    expect(obterConfig(db, 'instagram_token')).toBe('novo');
    expect(obterConfig(db, 'instagram_token_expira_em')).toBe('2026-12-15T15:00:00.000Z');
  });

  it('não renova quando faltam 30 dias', async () => {
    definirConfig(db, 'instagram_token_expira_em', '2026-11-15T15:00:00.000Z');
    const { falso, promessa } = rodar(rotasPadrao());
    await promessa;
    expect(falso.chamadas.some((u) => u.pathname === '/refresh_access_token')).toBe(false);
  });

  it('token inválido grava erro amigável e mantém as mídias', async () => {
    await rodar(rotasPadrao()).promessa;
    const { promessa } = rodar(rotasPadrao({ '/me': { status: 400, corpo: { error: { code: 190, message: 'Invalid' } } } }));
    await expect(promessa).rejects.toThrow(/Reconecte/);
    expect(obterConfig(db, 'instagram_ultimo_erro')).toMatch(/Reconecte em Configurações/);
    expect(db.prepare('SELECT COUNT(*) AS n FROM instagram_midias WHERE removido = 0').get().n).toBe(2);
  });

  it('sync bem-sucedida limpa o último erro', async () => {
    definirConfig(db, 'instagram_ultimo_erro', 'antigo');
    await rodar(rotasPadrao()).promessa;
    expect(obterConfig(db, 'instagram_ultimo_erro')).toBeNull();
  });

  it('sem token conectado lança erro', async () => {
    db.exec("DELETE FROM config WHERE chave = 'instagram_token'");
    await expect(rodar(rotasPadrao()).promessa).rejects.toThrow('Instagram não conectado');
  });

  it('liga novas mídias aos planejados e migra o legado', async () => {
    db.exec("INSERT INTO clientes (nome, criado_em, atualizado_em) VALUES ('Ana', 'x', 'x')");
    db.exec("INSERT INTO projetos (id, cliente_id, titulo, criado_em, atualizado_em) VALUES (9, 1, 'Popy', 'x', 'x')");
    db.exec("INSERT INTO conteudos (tipo, titulo, legenda, estado, criado_em, atualizado_em) VALUES ('reels', 'R', 'Reels Popy', 'pronto', '2026-10-05T00:00:00.000Z', 'x')");
    db.exec("INSERT INTO conteudos_legado (projeto_id, tipo, data_publicada) VALUES (9, 'post', '2026-10-01')");
    await rodar(rotasPadrao()).promessa;
    expect(db.prepare("SELECT midia_id FROM conteudos WHERE titulo = 'R'").get().midia_id).toBe('m1');
    expect(midia('m2').projeto_id).toBe(9);
  });

  it('primeira sync preenche o histórico de seguidores', async () => {
    await rodar(rotasPadrao({
      '/me/insights': { data: [{ name: 'follower_count', values: [{ value: 4, end_time: '2026-10-15T07:00:00+0000' }] }] },
    })).promessa;
    const serie = db.prepare('SELECT dia, seguidores FROM instagram_seguidores ORDER BY dia').all().map((r) => ({ ...r }));
    expect(serie).toEqual([{ dia: '2026-10-14', seguidores: 1284 }, { dia: '2026-10-16', seguidores: 1284 }]);
  });
});

describe('sincronizar — robustez', () => {
  it('falha de insights numa sync seguinte mantém os números anteriores', async () => {
    await rodar(rotasPadrao()).promessa;
    await rodar(rotasPadrao({ '/m1/insights': { status: 400, corpo: { error: { code: 4, message: 'rate limit' } } } })).promessa;
    expect(midia('m1')).toMatchObject({ alcance: 1870, salvamentos: 21 });
  });

  it('primeira sync interrompida: a próxima busca tudo de novo', async () => {
    db.prepare("INSERT INTO instagram_midias (id, tipo, publicado_em, atualizado_em) VALUES ('m1', 'reels', '2026-10-10T15:00:00.000Z', 'x')").run();
    const depois = new Date('2027-03-01T15:00:00.000Z');
    const { falso, promessa } = rodar(rotasPadrao(), depois);
    await promessa;
    expect(midia('m2').id).toBe('m2');
    expect(falso.chamadas.some((u) => u.pathname === '/me/insights')).toBe(true);
  });

  it('conta diferente: busca tudo e tira do grid os posts da conta anterior', async () => {
    await rodar(rotasPadrao()).promessa;
    const outra = rotasPadrao({
      '/me': { user_id: '999', username: 'outra', followers_count: 10, media_count: 1 },
      '/me/media': { data: [{ id: 'x1', caption: 'Outra', media_type: 'IMAGE', media_product_type: 'FEED', timestamp: '2025-01-01T10:00:00+0000' }] },
      '/x1/insights': { data: [] },
    });
    await rodar(outra).promessa;
    expect(midia('x1').removido).toBe(0);
    expect(midia('m1').removido).toBe(1);
    expect(midia('m2').removido).toBe(1);
  });

  it('capa antiga que faltou é buscada de novo fora da janela de 60 dias', async () => {
    await rodar(rotasPadrao({ 'https://cdn.test/m2.jpg': { status: 404, corpo: {} } })).promessa;
    const depois = new Date('2027-03-01T15:00:00.000Z');
    await rodar(rotasPadrao({
      '/me/media': { data: [] },
      '/m2': { id: 'm2', media_type: 'IMAGE', media_url: 'https://cdn.test/m2.jpg' },
    }), depois).promessa;
    expect(midia('m2').capa).toBe('instagram/m2.jpg');
  });

  it('resposta vazia com a conta tendo posts não remove nada nem desfaz vínculos', async () => {
    await rodar(rotasPadrao()).promessa;
    db.exec("INSERT INTO conteudos (tipo, titulo, estado, midia_id, criado_em, atualizado_em) VALUES ('post', 'P', 'pronto', 'm1', 'x', 'x')");
    await rodar(rotasPadrao({ '/me/media': { data: [] } })).promessa;
    expect(midia('m1').removido).toBe(0);
    expect(db.prepare("SELECT midia_id FROM conteudos WHERE titulo = 'P'").get().midia_id).toBe('m1');
  });

  it('falha ao renovar o token não impede a sync com o token atual', async () => {
    definirConfig(db, 'instagram_token_expira_em', '2026-10-26T00:00:00.000Z');
    const { promessa } = rodar(rotasPadrao({ '/refresh_access_token': { status: 500, corpo: { error: { code: 2, message: 'fora' } } } }));
    expect(await promessa).toEqual({ novas: 2, atualizadas: 0 });
    expect(obterConfig(db, 'instagram_token')).toBe('tok');
  });
});
