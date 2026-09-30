import { criarRepo, linha } from './crud.js';

export const CAMPOS_QRCODE = ['cliente_id', 'nome', 'categoria', 'descricao_local', 'destino_atual', 'imagem_arquivo', 'status'];

export function repoQrcodes(db) {
  const base = criarRepo(db, 'qrcodes', CAMPOS_QRCODE);

  function atualizar(id, dados) {
    const atual = base.obter(id);
    if (!atual) return null;
    const registrarHistorico = 'destino_atual' in dados && dados.destino_atual !== atual.destino_atual;
    const atualizado = base.atualizar(id, dados);
    if (registrarHistorico) {
      db.prepare(
        'INSERT INTO qrcodes_historico (qrcode_id, destino_anterior, destino_novo, alterado_em) VALUES (?, ?, ?, ?)',
      ).run(id, atual.destino_atual, dados.destino_atual, new Date().toISOString());
    }
    return atualizado;
  }

  return {
    ...base,
    atualizar,
    listar({ cliente_id, status } = {}) {
      const filtro = {};
      if (cliente_id) filtro.cliente_id = Number(cliente_id);
      if (status) filtro.status = status;
      return base.listar(filtro, 'nome COLLATE NOCASE');
    },
    historico(qrcodeId) {
      return db
        .prepare('SELECT * FROM qrcodes_historico WHERE qrcode_id = ? ORDER BY alterado_em DESC, id DESC')
        .all(qrcodeId)
        .map(linha);
    },
  };
}
