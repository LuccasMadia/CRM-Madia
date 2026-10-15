import { describe, it, expect, beforeEach } from 'vitest';
import { openDb } from '../db/connection.js';
import { repoPlacasModelos, repoPlacasModelosPacks, repoPlacasVendas, precoSugeridoPlacas } from './placas.js';
import { repoProjetosServicos } from './servicos.js';

let db;
let modelo;
const t = '2026-10-01T00:00:00.000Z';

function criarVenda({ clienteId, quantidade, modeloId = modelo.id }) {
  return repoPlacasVendas(db).criar({
    modelo_id: modeloId, quantidade, preco_vendido_centavos: 8000, custo_unitario_centavos: 700,
    cliente_id: clienteId, comprador_nome: null, data_venda: '2026-10-01',
  });
}

beforeEach(() => {
  db = openDb(':memory:');
  db.prepare('INSERT INTO clientes (id, nome, criado_em, atualizado_em) VALUES (1, ?, ?, ?), (2, ?, ?, ?)').run('Ana', t, t, 'Bia', t, t);
  modelo = repoPlacasModelos(db).criar({ nome: '10x15', preco_venda_centavos: 10000 });
  const packs = repoPlacasModelosPacks(db);
  packs.criar({ modelo_id: modelo.id, quantidade: 3, preco_total_centavos: 25000 });
  packs.criar({ modelo_id: modelo.id, quantidade: 2, preco_total_centavos: 18000 });
});

describe('repoPlacasModelosPacks', () => {
  it('lista os packs do modelo ordenados por quantidade', () => {
    expect(repoPlacasModelosPacks(db).listar({ modelo_id: modelo.id }).map((p) => p.quantidade)).toEqual([2, 3]);
  });
});

describe('quantidadeDoCliente', () => {
  it('soma vendas de qualquer modelo só do cliente pedido', () => {
    const outro = repoPlacasModelos(db).criar({ nome: '10x10', preco_venda_centavos: 8000 });
    criarVenda({ clienteId: 1, quantidade: 2 });
    criarVenda({ clienteId: 1, quantidade: 1, modeloId: outro.id });
    criarVenda({ clienteId: 2, quantidade: 5 });
    expect(repoPlacasVendas(db).quantidadeDoCliente(1, {})).toBe(3);
  });

  it('exclui as vendas ligadas à própria oportunidade', () => {
    db.prepare('INSERT INTO projetos (id, cliente_id, titulo, criado_em, atualizado_em) VALUES (1, 1, ?, ?, ?)').run('P', t, t);
    const venda = criarVenda({ clienteId: 1, quantidade: 2 });
    criarVenda({ clienteId: 1, quantidade: 1 });
    repoProjetosServicos(db).criar({ projeto_id: 1, tipo: 'placas_nfc', modelo_id: modelo.id, quantidade: 2, valor_unitario_centavos: 9000, valor_total_centavos: 18000, venda_id: venda.id });
    expect(repoPlacasVendas(db).quantidadeDoCliente(1, { excluirProjetoId: 1 })).toBe(1);
  });
});

describe('precoSugeridoPlacas', () => {
  it('cliente novo (sem clienteId) paga o pack', () => {
    expect(precoSugeridoPlacas(db, { modelo, quantidade: 2 })).toEqual({
      total_centavos: 18000, ja_comprou: 0, recompra: false, preco_por_placa_centavos: [10000, 8000],
    });
  });

  it('cliente com histórico paga a continuação do pack', () => {
    criarVenda({ clienteId: 1, quantidade: 1 });
    expect(precoSugeridoPlacas(db, { modelo, quantidade: 2, clienteId: 1 })).toMatchObject({ total_centavos: 15000, ja_comprou: 1, recompra: true });
  });
});
