import { criarRepo, linha } from './crud.js';

export function repoFerramentas(db) {
  const base = criarRepo(db, 'ferramentas', ['nome', 'cobranca', 'valor_centavos', 'dia_cobranca', 'cancelada_em', 'observacao']);
  return {
    ...base,
    // Gasto do mês: mensalidade conta o valor cheio até o mês do cancelamento; créditos contam as recargas feitas no mês.
    listarComGasto(mes) {
      return db.prepare(`
        SELECT f.*,
          CASE WHEN f.cobranca = 'mensalidade'
            THEN CASE WHEN f.cancelada_em IS NULL OR substr(f.cancelada_em, 1, 7) >= ?1 THEN COALESCE(f.valor_centavos, 0) ELSE 0 END
            ELSE (SELECT COALESCE(SUM(r.valor_centavos), 0) FROM ferramentas_recargas r
                  WHERE r.ferramenta_id = f.id AND substr(r.data, 1, 7) = ?1)
          END AS gasto_mes_centavos,
          (SELECT MAX(r.data) FROM ferramentas_recargas r WHERE r.ferramenta_id = f.id) AS ultima_recarga
        FROM ferramentas f
        ORDER BY f.cancelada_em IS NOT NULL, f.nome COLLATE NOCASE`).all(mes).map(linha);
    },
  };
}

export function repoRecargas(db) {
  const base = criarRepo(db, 'ferramentas_recargas', ['ferramenta_id', 'data', 'valor_centavos']);
  return {
    ...base,
    listarDa(ferramentaId) {
      return base.listar({ ferramenta_id: ferramentaId }, 'data DESC, id DESC');
    },
  };
}
