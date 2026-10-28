import { criarRepo } from './crud.js';
import { ErroValidacao } from '../http/erros.js';

export function repoLojas(db) {
  const base = criarRepo(db, 'lojas', ['cliente_id', 'nome', 'responsavel']);
  return {
    ...base,
    listarDoCliente(clienteId) {
      return base.listar({ cliente_id: clienteId }, 'nome COLLATE NOCASE, id');
    },
  };
}

// A loja precisa ser do mesmo cliente do projeto/venda.
export function exigirLojaDoCliente(db, lojaId, clienteId) {
  if (lojaId == null) return;
  const loja = repoLojas(db).obter(lojaId);
  if (!loja || loja.cliente_id !== clienteId) {
    throw new ErroValidacao([{ campo: 'loja_id', mensagem: 'Loja não encontrada neste cliente' }]);
  }
}
