import { criarRepo, linha } from './crud.js';

export const CAMPOS_PROJETO = [
  'cliente_id', 'titulo', 'descricao', 'etapa', 'valor_total_centavos', 'desconto_centavos',
  'data_inicio', 'prazo_entrega', 'data_entrega', 'notas',
  'mensalidade_ativa', 'mensalidade_valor_centavos', 'mensalidade_dia_vencimento',
  'mensalidade_inicio_modo', 'mensalidade_inicio_data',
  'postou_instagram', 'ficticio', 'servico', 'link_perfil', 'nicho_id',
  'prototipo_pronto', 'teste_inicio', 'orcamento_id',
];

// Parcelas avulsas (sem mensalidades) dizem se o projeto já foi pago.
const SELECT_COM_CLIENTE = `SELECT p.*, c.nome AS cliente_nome, COALESCE(pf.publicar, 0) AS no_portfolio, n.nome AS nicho_nome,
  (SELECT COUNT(*) FROM parcelas pa WHERE pa.projeto_id = p.id AND pa.mensalidade = 0) AS parcelas_total,
  (SELECT COUNT(*) FROM parcelas pa WHERE pa.projeto_id = p.id AND pa.mensalidade = 0 AND pa.pago_em IS NOT NULL) AS parcelas_pagas
  FROM projetos p
  JOIN clientes c ON c.id = p.cliente_id
  LEFT JOIN portfolio pf ON pf.projeto_id = p.id
  LEFT JOIN nichos n ON n.id = p.nicho_id`;

export function repoProjetos(db) {
  const base = criarRepo(db, 'projetos', CAMPOS_PROJETO);
  return {
    ...base,
    listarComCliente({ etapa, cliente_id, postou_instagram, ficticio, servico } = {}) {
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
      if (ficticio) {
        condicoes.push('p.ficticio = ?');
        args.push(Number(ficticio));
      }
      if (servico) {
        condicoes.push('p.servico = ?');
        args.push(servico);
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
