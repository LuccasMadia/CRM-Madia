import { Router } from 'express';
import { repoPlacasMateriais, repoPlacasLotes, repoPlacasModelosItens, repoPlacasVendas } from '../repos/placas.js';
import { validar, lerId } from '../http/validar.js';
import { ErroValidacao, naoEncontrado } from '../http/erros.js';
import { estoqueMaterial, custoAtualMaterial } from '../domain/placas.js';

const REGRAS_MATERIAL = {
  nome: { tipo: 'texto', obrigatorio: true },
};

const REGRAS_LOTE = {
  material_id: { tipo: 'inteiro', obrigatorio: true },
  nome_lote: { tipo: 'texto' },
  quantidade: { tipo: 'inteiro', obrigatorio: true, min: 1 },
  valor_kit_centavos: { tipo: 'inteiro', obrigatorio: true, min: 0 },
  valor_frete_centavos: { tipo: 'inteiro', min: 0, padrao: 0 },
  data_compra: { tipo: 'data', obrigatorio: true },
};

export function rotasPlacas({ db }) {
  const materiais = repoPlacasMateriais(db);
  const lotes = repoPlacasLotes(db);
  const itensModelo = repoPlacasModelosItens(db);
  const vendas = repoPlacasVendas(db);
  const r = Router();

  function comCalculo(material) {
    const lotesTodos = lotes.listar();
    const vendasTodas = vendas.listar();
    const todosItens = itensModelo.listar();
    return {
      ...material,
      estoque_atual: estoqueMaterial(material.id, lotesTodos, vendasTodas, todosItens),
      custo_unitario_atual: custoAtualMaterial(material.id, lotesTodos),
    };
  }

  function exigirMaterial(materialId) {
    if (!materiais.obter(materialId)) {
      throw new ErroValidacao([{ campo: 'material_id', mensagem: 'Material não encontrado' }]);
    }
  }

  r.get('/placas/materiais', (req, res) => {
    res.json(materiais.listar().map(comCalculo));
  });

  r.post('/placas/materiais', (req, res) => {
    const dados = validar(req.body, REGRAS_MATERIAL);
    res.status(201).json(comCalculo(materiais.criar(dados)));
  });

  r.put('/placas/materiais/:id', (req, res) => {
    const id = lerId(req.params.id);
    const dados = validar(req.body, REGRAS_MATERIAL, { parcial: true });
    const atualizado = materiais.atualizar(id, dados);
    if (!atualizado) throw naoEncontrado('Material');
    res.json(comCalculo(atualizado));
  });

  r.delete('/placas/materiais/:id', (req, res) => {
    const id = lerId(req.params.id);
    if (!materiais.obter(id)) throw naoEncontrado('Material');
    if (lotes.listar({ material_id: id }).length) {
      throw new ErroValidacao([{ campo: 'id', mensagem: 'Material tem lotes de compra vinculados' }]);
    }
    if (itensModelo.listar().some((i) => i.material_id === id)) {
      throw new ErroValidacao([{ campo: 'id', mensagem: 'Material está usado na receita de um modelo' }]);
    }
    materiais.remover(id);
    res.status(204).end();
  });

  r.get('/placas/lotes', (req, res) => {
    res.json(lotes.listar({ material_id: req.query.material_id }));
  });

  r.post('/placas/lotes', (req, res) => {
    const dados = validar(req.body, REGRAS_LOTE);
    exigirMaterial(dados.material_id);
    res.status(201).json(lotes.criar(dados));
  });

  r.put('/placas/lotes/:id', (req, res) => {
    const id = lerId(req.params.id);
    const dados = validar(req.body, REGRAS_LOTE, { parcial: true });
    if (dados.material_id !== undefined) exigirMaterial(dados.material_id);
    const atualizado = lotes.atualizar(id, dados);
    if (!atualizado) throw naoEncontrado('Lote');
    res.json(atualizado);
  });

  r.delete('/placas/lotes/:id', (req, res) => {
    if (!lotes.remover(lerId(req.params.id))) throw naoEncontrado('Lote');
    res.status(204).end();
  });

  return r;
}
