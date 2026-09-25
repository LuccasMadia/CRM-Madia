import { criarRepo, linha } from './crud.js';

export const CAMPOS_PROJETO = [
  'cliente_id', 'titulo', 'descricao', 'etapa', 'valor_total_centavos',
  'data_inicio', 'prazo_entrega', 'data_entrega', 'notas',
  'mensalidade_ativa', 'mensalidade_valor_centavos', 'mensalidade_dia_vencimento',
  'postou_instagram',
];

const SELECT_COM_CLIENTE = 'SELECT p.*, c.nome AS cliente_nome FROM projetos p JOIN clientes c ON c.id = p.cliente_id';

export function repoProjetos(db) {
  const base = criarRepo(db, 'projetos', CAMPOS_PROJETO);
  return {
    ...base,
    listarComCliente({ etapa, cliente_id, postou_instagram } = {}) {
      const condicoes = [];
      const args = [];
      if (etapa) {
        condicoes.push('p.etapa = ?');
        args.push(etapa);
      }
      if (cliente_id) {
        condicoes.push('p.cliente_id = ?');
        args.push(Number(cliente_id));
      }
      if (postou_instagram) {
        condicoes.push('p.postou_instagram = ?');
        args.push(Number(postou_instagram));
      }
      const where = condicoes.length ? ` WHERE ${condicoes.join(' AND ')}` : '';
      return db
        .prepare(`${SELECT_COM_CLIENTE}${where} ORDER BY p.prazo_entrega IS NULL, p.prazo_entrega, p.id`)
        .all(...args)
        .map(linha);
    },
    obterComCliente(id) {
      return linha(db.prepare(`${SELECT_COM_CLIENTE} WHERE p.id = ?`).get(id));
    },
  };
}
