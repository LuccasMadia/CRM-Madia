import { linha, emTransacao } from './crud.js';

export function repoConteudoMidias(db) {
  const listar = (conteudoId) =>
    db.prepare('SELECT * FROM conteudo_midias WHERE conteudo_id = ? ORDER BY ordem, id').all(conteudoId).map(linha);

  const obter = (id) => linha(db.prepare('SELECT * FROM conteudo_midias WHERE id = ?').get(id));

  const arquivosDe = (conteudoId) => listar(conteudoId).map((m) => m.arquivo);

  function adicionar(conteudoId, { arquivo, tipo, largura, altura }) {
    const { n } = db.prepare('SELECT COALESCE(MAX(ordem) + 1, 0) AS n FROM conteudo_midias WHERE conteudo_id = ?').get(conteudoId);
    db.prepare('INSERT INTO conteudo_midias (conteudo_id, arquivo, tipo, largura, altura, ordem) VALUES (?, ?, ?, ?, ?, ?)').run(
      conteudoId,
      arquivo,
      tipo,
      largura ?? null,
      altura ?? null,
      n,
    );
  }

  function remover(id) {
    return db.prepare('DELETE FROM conteudo_midias WHERE id = ?').run(id).changes > 0;
  }

  // Devolve false se `ids` não for exatamente o conjunto de mídias do conteúdo.
  function reordenar(conteudoId, ids) {
    const atuais = listar(conteudoId).map((m) => m.id);
    const valido =
      Array.isArray(ids) && ids.length === atuais.length && new Set(ids).size === ids.length && ids.every((id) => atuais.includes(id));
    if (!valido) return false;
    const atualizar = db.prepare('UPDATE conteudo_midias SET ordem = ? WHERE id = ?');
    emTransacao(db, () => ids.forEach((id, indice) => atualizar.run(indice, id)));
    return true;
  }

  // Anexa `midias` e `capa_url` a uma linha de conteúdo.
  function comMidias(conteudo) {
    if (!conteudo) return conteudo;
    const midias = listar(conteudo.id).map((m) => ({
      id: m.id,
      url: `/uploads/${m.arquivo}`,
      tipo: m.tipo,
      largura: m.largura,
      altura: m.altura,
      ordem: m.ordem,
    }));
    return { ...conteudo, midias, capa_url: midias[0]?.url ?? null };
  }

  return { listar, obter, arquivosDe, adicionar, remover, reordenar, comMidias };
}
