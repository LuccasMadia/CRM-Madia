import { criarRepo } from './crud.js';

export const CAMPOS_QRCODE = ['cliente_id', 'nome', 'categoria', 'descricao_local', 'imagem_arquivo', 'status'];

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
  };
}
