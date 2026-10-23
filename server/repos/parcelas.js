import { criarRepo } from './crud.js';

export const CAMPOS_PARCELA = ['projeto_id', 'descricao', 'valor_centavos', 'vencimento', 'pago_em', 'mensalidade', 'orcamento_id'];

export function repoParcelas(db) {
  const base = criarRepo(db, 'parcelas', CAMPOS_PARCELA);
  return {
    ...base,
    listarAvulsas(projetoId) {
      return base.listar({ projeto_id: projetoId, mensalidade: 0 }, 'vencimento, id');
    },
  };
}
