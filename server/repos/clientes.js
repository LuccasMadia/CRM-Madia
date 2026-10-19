import { criarRepo, linha, emTransacao } from './crud.js';

// `nome` é o nome da empresa; a pessoa de contato fica em `responsavel`.
export const CAMPOS_CLIENTE = ['nome', 'responsavel', 'email', 'telefone', 'instagram', 'origem', 'notas'];

export function repoClientes(db) {
  const base = criarRepo(db, 'clientes', CAMPOS_CLIENTE);
  return {
    ...base,
    buscar(termo = '') {
      const padrao = `%${termo.trim()}%`;
      return db
        .prepare('SELECT * FROM clientes WHERE nome LIKE ? OR responsavel LIKE ? OR instagram LIKE ? OR email LIKE ? ORDER BY nome COLLATE NOCASE')
        .all(padrao, padrao, padrao, padrao)
        .map(linha);
    },
    totalFaturado(id) {
      return db
        .prepare(
          `SELECT COALESCE(SUM(pa.valor_centavos), 0) AS total
           FROM parcelas pa JOIN projetos p ON p.id = pa.projeto_id
           WHERE p.cliente_id = ? AND pa.pago_em IS NOT NULL`,
        )
        .get(id).total;
    },
    contarProjetos(id) {
      return db.prepare('SELECT COUNT(*) AS n FROM projetos WHERE cliente_id = ?').get(id).n;
    },
    removerComQrcodes(id) {
      return emTransacao(db, () => {
        db.prepare('DELETE FROM projetos_qrcodes WHERE qrcode_id IN (SELECT id FROM qrcodes WHERE cliente_id = ?)').run(id);
        db.prepare('DELETE FROM qrcodes WHERE cliente_id = ?').run(id);
        return base.remover(id);
      });
    },
  };
}
