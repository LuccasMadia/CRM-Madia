import { criarRepo, linha } from './crud.js';

export const CAMPOS_SERVICO = ['projeto_id', 'tipo', 'modelo_id', 'quantidade', 'valor_unitario_centavos', 'venda_id'];

export function repoProjetosServicos(db) {
  const base = criarRepo(db, 'projetos_servicos', CAMPOS_SERVICO);
  return {
    ...base,
    listar(projetoId) {
      return base.listar({ projeto_id: projetoId }, 'id');
    },
    removerPorProjetoSemVenda(projetoId) {
      db.prepare('DELETE FROM projetos_servicos WHERE projeto_id = ? AND venda_id IS NULL').run(projetoId);
    },
    listarPlacasPendentes(projetoId) {
      return db
        .prepare("SELECT * FROM projetos_servicos WHERE projeto_id = ? AND tipo = 'placas_nfc' AND venda_id IS NULL")
        .all(projetoId)
        .map(linha);
    },
  };
}
