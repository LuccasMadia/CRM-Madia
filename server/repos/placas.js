import { criarRepo, linha } from './crud.js';
import { precoPlacas, montadasDoModelo, estadoVendaPlaca, valorVendaPlaca } from '../domain/placas.js';

export const CAMPOS_MATERIAL = ['nome', 'ativo'];
export function repoPlacasMateriais(db) {
  const base = criarRepo(db, 'placas_materiais', CAMPOS_MATERIAL);
  return { ...base, listar: () => base.listar({}, 'nome COLLATE NOCASE') };
}

export const CAMPOS_LOTE = ['material_id', 'nome_lote', 'quantidade', 'valor_kit_centavos', 'valor_frete_centavos', 'data_compra'];
export function repoPlacasLotes(db) {
  const base = criarRepo(db, 'placas_lotes', CAMPOS_LOTE);
  return {
    ...base,
    listar({ material_id } = {}) {
      const filtro = {};
      if (material_id) filtro.material_id = Number(material_id);
      return base.listar(filtro, 'data_compra DESC, id DESC');
    },
  };
}

export const CAMPOS_MODELO = ['nome', 'preco_venda_centavos', 'ativo'];
export function repoPlacasModelos(db) {
  const base = criarRepo(db, 'placas_modelos', CAMPOS_MODELO);
  return { ...base, listar: () => base.listar({}, 'nome COLLATE NOCASE') };
}

export const CAMPOS_ITEM = ['modelo_id', 'material_id', 'quantidade'];
export function repoPlacasModelosItens(db) {
  const base = criarRepo(db, 'placas_modelos_itens', CAMPOS_ITEM);
  return {
    ...base,
    listar({ modelo_id } = {}) {
      const filtro = {};
      if (modelo_id) filtro.modelo_id = Number(modelo_id);
      return base.listar(filtro, 'id');
    },
    removerPorModelo(modeloId) {
      db.prepare('DELETE FROM placas_modelos_itens WHERE modelo_id = ?').run(modeloId);
    },
  };
}

export const CAMPOS_PACK = ['modelo_id', 'quantidade', 'preco_total_centavos'];
export function repoPlacasModelosPacks(db) {
  const base = criarRepo(db, 'placas_modelos_packs', CAMPOS_PACK);
  return {
    ...base,
    listar({ modelo_id } = {}) {
      const filtro = {};
      if (modelo_id) filtro.modelo_id = Number(modelo_id);
      return base.listar(filtro, 'modelo_id, quantidade');
    },
    removerPorModelo(modeloId) {
      db.prepare('DELETE FROM placas_modelos_packs WHERE modelo_id = ?').run(modeloId);
    },
  };
}

export const CAMPOS_VENDA = [
  'modelo_id', 'quantidade', 'preco_vendido_centavos', 'custo_unitario_centavos',
  'cliente_id', 'comprador_nome', 'data_venda', 'recebido_em', 'quantidade_montada', 'orcamento_id', 'loja_id',
];
export function repoPlacasVendas(db) {
  const base = criarRepo(db, 'placas_vendas', CAMPOS_VENDA);
  return {
    ...base,
    listar: () => base.listar({}, 'data_venda DESC, id DESC'),
    quantidadeDoCliente(clienteId, { excluirProjetoId = null } = {}) {
      return db.prepare(`
        SELECT COALESCE(SUM(quantidade), 0) AS n FROM placas_vendas
        WHERE cliente_id = ?
          AND id NOT IN (SELECT venda_id FROM projetos_servicos WHERE projeto_id = ? AND venda_id IS NOT NULL)
      `).get(clienteId, excluirProjetoId ?? -1).n;
    },
    listarDoCliente(clienteId) {
      return db.prepare(`
        SELECT v.*, m.nome AS modelo_nome, l.nome AS loja_nome FROM placas_vendas v JOIN placas_modelos m ON m.id = v.modelo_id
        LEFT JOIN lojas l ON l.id = v.loja_id
        WHERE v.cliente_id = ? ORDER BY v.data_venda DESC, v.id DESC
      `).all(clienteId).map(linha);
    },
    listarAvulsasDoCliente(clienteId) {
      return db.prepare(`
        SELECT v.*, m.nome AS modelo_nome, l.nome AS loja_nome FROM placas_vendas v JOIN placas_modelos m ON m.id = v.modelo_id
        LEFT JOIN lojas l ON l.id = v.loja_id
        WHERE v.cliente_id = ?
          AND v.id NOT IN (SELECT venda_id FROM projetos_servicos WHERE venda_id IS NOT NULL)
        ORDER BY v.data_venda DESC, v.id DESC
      `).all(clienteId).map(linha);
    },
  };
}

export const CAMPOS_AVARIA = ['modelo_id', 'quantidade', 'custo_unitario_centavos', 'observacao', 'data_avaria'];
export function repoPlacasAvarias(db) {
  const base = criarRepo(db, 'placas_avarias', CAMPOS_AVARIA);
  return { ...base, listar: () => base.listar({}, 'data_avaria DESC, id DESC') };
}

export const CAMPOS_ITEM_AVARIA = ['avaria_id', 'material_id', 'quantidade'];
export function repoPlacasAvariasItens(db) {
  const base = criarRepo(db, 'placas_avarias_itens', CAMPOS_ITEM_AVARIA);
  return {
    ...base,
    listar({ avaria_id } = {}) {
      const filtro = {};
      if (avaria_id) filtro.avaria_id = Number(avaria_id);
      return base.listar(filtro, 'id');
    },
    removerPorAvaria(avariaId) {
      db.prepare('DELETE FROM placas_avarias_itens WHERE avaria_id = ?').run(avariaId);
    },
  };
}

export const CAMPOS_MONTAGEM = ['modelo_id', 'quantidade', 'data_montagem'];
export function repoPlacasMontagens(db) {
  const base = criarRepo(db, 'placas_montagens', CAMPOS_MONTAGEM);
  return { ...base, listar: () => base.listar({}, 'data_montagem DESC, id DESC') };
}

export const CAMPOS_ITEM_MONTAGEM = ['montagem_id', 'material_id', 'quantidade'];
export function repoPlacasMontagensItens(db) {
  const base = criarRepo(db, 'placas_montagens_itens', CAMPOS_ITEM_MONTAGEM);
  return {
    ...base,
    listar({ montagem_id } = {}) {
      const filtro = {};
      if (montagem_id) filtro.montagem_id = Number(montagem_id);
      return base.listar(filtro, 'id');
    },
  };
}

// Vendas geradas na entrega de um projeto: o dinheiro delas entra pelas parcelas do projeto.
export function idsVendasDeProjeto(db) {
  return new Set(db.prepare('SELECT venda_id FROM projetos_servicos WHERE venda_id IS NOT NULL').all().map((l) => l.venda_id));
}

// Quantas placas montadas do modelo ainda estão livres (ignorando o que a própria venda já usa, ao editar).
export function montadasDisponiveis(db, modeloId, { ignorarVendaId = null } = {}) {
  const vendas = repoPlacasVendas(db).listar().filter((v) => v.id !== ignorarVendaId);
  return montadasDoModelo(modeloId, repoPlacasMontagens(db).listar(), vendas);
}

// Vendas de placa no formato das parcelas, para somar no Início e no Financeiro.
// As que vieram de projeto ficam de fora: o dinheiro delas entra pelas parcelas do projeto.
export function vendasPlacasComoParcelas(db, hoje) {
  return db.prepare(`
    SELECT v.*, m.nome AS modelo_nome, c.nome AS cliente_nome FROM placas_vendas v
    JOIN placas_modelos m ON m.id = v.modelo_id LEFT JOIN clientes c ON c.id = v.cliente_id
    WHERE v.id NOT IN (SELECT venda_id FROM projetos_servicos WHERE venda_id IS NOT NULL)
    ORDER BY v.data_venda, v.id
  `).all().map(linha).map((v) => ({
    tipo: 'venda_placa',
    id: v.id,
    valor_centavos: valorVendaPlaca(v),
    vencimento: v.data_venda,
    pago_em: v.recebido_em,
    estado: estadoVendaPlaca(v, hoje),
    servico: 'placas_nfc',
    cliente_id: v.cliente_id,
    cliente_nome: v.cliente_nome ?? v.comprador_nome,
    projeto_titulo: `${v.modelo_nome} × ${v.quantidade}`,
    descricao: 'Venda de placas',
  }));
}

export function precoSugeridoPlacas(db, { modelo, quantidade, clienteId = null, projetoId = null }) {
  const packs = repoPlacasModelosPacks(db).listar({ modelo_id: modelo.id });
  const jaComprou = clienteId ? repoPlacasVendas(db).quantidadeDoCliente(clienteId, { excluirProjetoId: projetoId }) : 0;
  const { total_centavos, preco_por_placa_centavos } = precoPlacas(modelo, packs, jaComprou, quantidade);
  return { total_centavos, ja_comprou: jaComprou, recompra: jaComprou > 0, preco_por_placa_centavos };
}
