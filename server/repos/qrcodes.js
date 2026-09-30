import { criarRepo, linha } from './crud.js';

export const CAMPOS_QRCODE = ['cliente_id', 'nome', 'categoria', 'descricao_local', 'destino_atual', 'imagem_arquivo', 'status'];

export function repoQrcodes(db) {
  const base = criarRepo(db, 'qrcodes', CAMPOS_QRCODE);
  return {
    ...base,
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
