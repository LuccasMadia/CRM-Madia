import { criarRepo } from './crud.js';

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

export const CAMPOS_VENDA = [
  'modelo_id', 'quantidade', 'preco_vendido_centavos', 'custo_unitario_centavos',
  'cliente_id', 'comprador_nome', 'data_venda',
];
export function repoPlacasVendas(db) {
  const base = criarRepo(db, 'placas_vendas', CAMPOS_VENDA);
  return { ...base, listar: () => base.listar({}, 'data_venda DESC, id DESC') };
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
