import { linha } from './crud.js';

export function repoProjetosQrcodes(db) {
  return {
    listar(projetoId) {
      return db
        .prepare(`SELECT q.id, q.nome FROM projetos_qrcodes pq JOIN qrcodes q ON q.id = pq.qrcode_id
          WHERE pq.projeto_id = ? ORDER BY q.id`)
        .all(projetoId)
        .map(linha);
    },
    substituir(projetoId, qrcodeIds) {
      db.prepare('DELETE FROM projetos_qrcodes WHERE projeto_id = ?').run(projetoId);
      const inserir = db.prepare('INSERT INTO projetos_qrcodes (projeto_id, qrcode_id) VALUES (?, ?)');
      for (const qrcodeId of qrcodeIds) inserir.run(projetoId, qrcodeId);
    },
  };
}
