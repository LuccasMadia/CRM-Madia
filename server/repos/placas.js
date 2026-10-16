import { criarRepo, linha } from './crud.js';
import { precoPlacas } from '../domain/placas.js';

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
  'cliente_id', 'comprador_nome', 'data_venda',
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
    listarAvulsasDoCliente(clienteId) {
      return db.prepare(`
        SELECT v.*, m.nome AS modelo_nome FROM placas_vendas v JOIN placas_modelos m ON m.id = v.modelo_id
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

export function precoSugeridoPlacas(db, { modelo, quantidade, clienteId = null, projetoId = null }) {
  const packs = repoPlacasModelosPacks(db).listar({ modelo_id: modelo.id });
  const jaComprou = clienteId ? repoPlacasVendas(db).quantidadeDoCliente(clienteId, { excluirProjetoId: projetoId }) : 0;
  const { total_centavos, preco_por_placa_centavos } = precoPlacas(modelo, packs, jaComprou, quantidade);
  return { total_centavos, ja_comprou: jaComprou, recompra: jaComprou > 0, preco_por_placa_centavos };
}
