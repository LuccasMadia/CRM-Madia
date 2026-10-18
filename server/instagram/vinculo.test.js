import { describe, it, expect, beforeEach } from 'vitest';
import { openDb } from '../db/connection.js';
import { vincular, desvincular, vincularAutomatico, migrarLegado, candidatosManuais } from './vinculo.js';

let db;
beforeEach(() => {
  db = openDb(':memory:');
  db.exec("INSERT INTO clientes (nome, criado_em, atualizado_em) VALUES ('Ana', 'x', 'x')");
  db.exec("INSERT INTO projetos (id, cliente_id, titulo, criado_em, atualizado_em) VALUES (9, 1, 'Site Popy', 'x', 'x')");
});

function planejado({ legenda = null, estado = 'pronto', criado = '2026-10-01T10:00:00.000Z', projeto = 9, ordem = 0 } = {}) {
  const r = db
    .prepare("INSERT INTO conteudos (projeto_id, tipo, titulo, legenda, estado, ordem, criado_em, atualizado_em) VALUES (?, 'post', 'P', ?, ?, ?, ?, ?)")
    .run(projeto, legenda, estado, ordem, criado, criado);
  return Number(r.lastInsertRowid);
}
function midia({ id = 'm1', legenda = null, publicado = '2026-10-10T15:00:00.000Z', tipo = 'post' } = {}) {
  db.prepare('INSERT INTO instagram_midias (id, tipo, legenda, publicado_em, atualizado_em) VALUES (?, ?, ?, ?, ?)').run(id, tipo, legenda, publicado, 'x');
  return { id, tipo, legenda, publicado_em: publicado };
}
const conteudo = (id) => ({ ...db.prepare('SELECT * FROM conteudos WHERE id = ?').get(id) });
const projetoDaMidia = (id) => db.prepare('SELECT projeto_id FROM instagram_midias WHERE id = ?').get(id).projeto_id;
const postou = () => db.prepare('SELECT postou_instagram FROM projetos WHERE id = 9').get().postou_instagram;

describe('vincularAutomatico', () => {
  it('liga quando a legenda bate e o post é posterior ao planejado', () => {
    const c = planejado({ legenda: 'Placa NFC nova! #nfc' });
    expect(vincularAutomatico(db, midia({ legenda: 'placa nfc nova! 🚀' }))).toBe(true);
    expect(conteudo(c).midia_id).toBe('m1');
    expect(projetoDaMidia('m1')).toBe(9);
    expect(postou()).toBe(1);
  });

  it('não liga post publicado antes de o planejado existir', () => {
    planejado({ legenda: 'Placa NFC nova!', criado: '2026-10-12T10:00:00.000Z' });
    expect(vincularAutomatico(db, midia({ legenda: 'Placa NFC nova!' }))).toBe(false);
  });

  it('não liga quando há dois candidatos', () => {
    planejado({ legenda: 'Mesma legenda' });
    planejado({ legenda: 'Mesma legenda', estado: 'rascunho' });
    expect(vincularAutomatico(db, midia({ legenda: 'Mesma legenda' }))).toBe(false);
  });

  it('considera rascunhos também', () => {
    const c = planejado({ legenda: 'Rascunho que saiu', estado: 'rascunho' });
    expect(vincularAutomatico(db, midia({ legenda: 'Rascunho que saiu' }))).toBe(true);
    expect(conteudo(c).midia_id).toBe('m1');
  });

  it('legenda vazia ou só hashtags nunca liga', () => {
    planejado({ legenda: '#so #tags' });
    planejado({ legenda: null });
    expect(vincularAutomatico(db, midia({ legenda: '#so #tags' }))).toBe(false);
    expect(vincularAutomatico(db, midia({ id: 'm2', legenda: null }))).toBe(false);
  });
});

describe('vínculo manual', () => {
  it('desvincular devolve o planejado e tira o projeto herdado, mas não desmarca postou', () => {
    const c = planejado({ legenda: 'x' });
    midia();
    vincular(db, c, 'm1');
    desvincular(db, 'm1');
    expect(conteudo(c).midia_id).toBeNull();
    expect(projetoDaMidia('m1')).toBeNull();
    expect(postou()).toBe(1);
  });

  it('desvincular mantém projeto escolhido à mão que difere do planejado', () => {
    const c = planejado({ projeto: null });
    midia();
    db.exec("UPDATE instagram_midias SET projeto_id = 9 WHERE id = 'm1'");
    vincular(db, c, 'm1');
    desvincular(db, 'm1');
    expect(projetoDaMidia('m1')).toBe(9);
  });

  it('recusa ligar mídia já ligada a outro planejado', () => {
    const a = planejado();
    const b = planejado();
    midia();
    vincular(db, a, 'm1');
    expect(() => vincular(db, b, 'm1')).toThrow();
  });

  it('candidatos: só os anteriores ao post, prontos por ordem e depois rascunhos', () => {
    const r = planejado({ estado: 'rascunho' });
    const p2 = planejado({ ordem: 2 });
    const p1 = planejado({ ordem: 1 });
    planejado({ criado: '2026-10-20T00:00:00.000Z' });
    expect(candidatosManuais(db, midia()).map((c) => c.id)).toEqual([p1, p2, r]);
  });
});

describe('migrarLegado', () => {
  it('passa o projeto para o post do mesmo dia e tipo e limpa o legado', () => {
    db.exec("INSERT INTO conteudos_legado (projeto_id, tipo, data_publicada) VALUES (9, 'reels', '2026-09-26'), (9, 'post', '2026-09-27')");
    midia({ id: 'r1', tipo: 'reels', publicado: '2026-09-26T15:00:00.000Z' });
    midia({ id: 'p1', tipo: 'reels', publicado: '2026-09-27T15:00:00.000Z' });
    migrarLegado(db);
    expect(projetoDaMidia('r1')).toBe(9);
    expect(projetoDaMidia('p1')).toBeNull();
    expect(db.prepare('SELECT COUNT(*) AS n FROM conteudos_legado').get().n).toBe(0);
  });

  it('marcado como publicado em outro dia: acha o post pela legenda', () => {
    db.exec(`INSERT INTO conteudos_legado (projeto_id, tipo, data_publicada, legenda)
      VALUES (9, 'reels', '2026-10-16', 'Tour rápido pelo cardápio digital da Sorveteria Pingou 🎬')`);
    midia({ id: 'r1', tipo: 'reels', publicado: '2026-10-12T15:00:00.000Z', legenda: 'Tour rápido pelo cardápio digital da Sorveteria Pingou 🍦 #portfolio' });
    midia({ id: 'r2', tipo: 'reels', publicado: '2026-10-13T15:00:00.000Z', legenda: 'Outro reels' });
    migrarLegado(db);
    expect(projetoDaMidia('r1')).toBe(9);
    expect(projetoDaMidia('r2')).toBeNull();
  });

  it('legenda de outro tipo não conta', () => {
    db.exec("INSERT INTO conteudos_legado (projeto_id, tipo, data_publicada, legenda) VALUES (9, 'reels', '2026-10-16', 'Tour pelo site')");
    midia({ id: 'p1', tipo: 'post', publicado: '2026-10-12T15:00:00.000Z', legenda: 'Tour pelo site' });
    migrarLegado(db);
    expect(projetoDaMidia('p1')).toBeNull();
  });
});

describe('vincular — planejado já ligado', () => {
  it('recusa ligar planejado que já está ligado a outro post', () => {
    const c = planejado();
    midia({ id: 'a' });
    midia({ id: 'b' });
    vincular(db, c, 'a');
    expect(() => vincular(db, c, 'b')).toThrow();
    expect(conteudo(c).midia_id).toBe('a');
  });
});
