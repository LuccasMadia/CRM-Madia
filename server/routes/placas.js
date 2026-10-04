import { Router } from 'express';
import { repoPlacasMateriais, repoPlacasLotes, repoPlacasModelos, repoPlacasModelosItens, repoPlacasVendas } from '../repos/placas.js';
import { repoClientes } from '../repos/clientes.js';
import { emTransacao } from '../repos/crud.js';
import { validar, lerId } from '../http/validar.js';
import { ErroValidacao, naoEncontrado } from '../http/erros.js';
import {
  estoqueMaterial, custoAtualMaterial, custoReceitaModelo, lucroPrevisto,
  lucroRealVenda, materiaisComEstoqueNegativo,
} from '../domain/placas.js';

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

const REGRAS_MODELO = {
  nome: { tipo: 'texto', obrigatorio: true },
  preco_venda_centavos: { tipo: 'inteiro', obrigatorio: true, min: 0 },
};

const REGRAS_VENDA = {
  modelo_id: { tipo: 'inteiro', obrigatorio: true },
  quantidade: { tipo: 'inteiro', min: 1 },
  preco_vendido_centavos: { tipo: 'inteiro', obrigatorio: true, min: 0 },
  cliente_id: { tipo: 'inteiro' },
  comprador_nome: { tipo: 'texto' },
  data_venda: { tipo: 'data', obrigatorio: true },
};

export function rotasPlacas({ db }) {
  const materiais = repoPlacasMateriais(db);
  const lotes = repoPlacasLotes(db);
  const modelos = repoPlacasModelos(db);
  const itensModelo = repoPlacasModelosItens(db);
  const vendas = repoPlacasVendas(db);
  const clientes = repoClientes(db);
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

  function validarItens(itensBrutos) {
    if (!Array.isArray(itensBrutos)) throw new ErroValidacao([{ campo: 'itens', mensagem: 'Deve ser uma lista' }]);
    return itensBrutos.map((item, i) => {
      const materialId = Number(item.material_id);
      const quantidade = Number(item.quantidade);
      if (!Number.isInteger(materialId) || materialId <= 0 || !materiais.obter(materialId)) {
        throw new ErroValidacao([{ campo: `itens[${i}].material_id`, mensagem: 'Material inválido' }]);
      }
      if (!Number.isInteger(quantidade) || quantidade < 1) {
        throw new ErroValidacao([{ campo: `itens[${i}].quantidade`, mensagem: 'Deve ser no mínimo 1' }]);
      }
      return { material_id: materialId, quantidade };
    });
  }

  function montarModelo(modelo) {
    const todosItens = itensModelo.listar();
    const custoReceita = custoReceitaModelo(modelo.id, todosItens, lotes.listar());
    return {
      ...modelo,
      itens: todosItens.filter((i) => i.modelo_id === modelo.id),
      custo_previsto_centavos: custoReceita,
      lucro_previsto_centavos: lucroPrevisto(modelo, custoReceita),
    };
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

  r.get('/placas/modelos', (req, res) => {
    res.json(modelos.listar().map(montarModelo));
  });

  r.post('/placas/modelos', (req, res) => {
    const dados = validar(req.body, REGRAS_MODELO);
    const itens = validarItens(req.body.itens ?? []);
    const criado = emTransacao(db, () => {
      const modelo = modelos.criar(dados);
      for (const item of itens) itensModelo.criar({ ...item, modelo_id: modelo.id });
      return modelo;
    });
    res.status(201).json(montarModelo(criado));
  });

  r.put('/placas/modelos/:id', (req, res) => {
    const id = lerId(req.params.id);
    if (!modelos.obter(id)) throw naoEncontrado('Modelo');
    const dados = validar(req.body, REGRAS_MODELO, { parcial: true });
    const itens = req.body.itens !== undefined ? validarItens(req.body.itens) : null;
    emTransacao(db, () => {
      if (Object.keys(dados).length) modelos.atualizar(id, dados);
      if (itens) {
        itensModelo.removerPorModelo(id);
        for (const item of itens) itensModelo.criar({ ...item, modelo_id: id });
      }
    });
    res.json(montarModelo(modelos.obter(id)));
  });

  r.delete('/placas/modelos/:id', (req, res) => {
    const id = lerId(req.params.id);
    if (!modelos.obter(id)) throw naoEncontrado('Modelo');
    if (vendas.listar().some((v) => v.modelo_id === id)) {
      throw new ErroValidacao([{ campo: 'id', mensagem: 'Modelo tem vendas vinculadas' }]);
    }
    emTransacao(db, () => {
      itensModelo.removerPorModelo(id);
      modelos.remover(id);
    });
    res.status(204).end();
  });

  r.get('/placas/vendas', (req, res) => {
    const modelosTodos = modelos.listar();
    const clientesTodos = clientes.listar();
    res.json(vendas.listar().map((v) => ({
      ...v,
      lucro_real_centavos: lucroRealVenda(v),
      modelo_nome: modelosTodos.find((m) => m.id === v.modelo_id)?.nome ?? '—',
      cliente_nome: v.cliente_id ? (clientesTodos.find((c) => c.id === v.cliente_id)?.nome ?? '—') : null,
    })));
  });

  r.post('/placas/vendas', (req, res) => {
    const dados = validar(req.body, REGRAS_VENDA);
    const temCliente = dados.cliente_id !== undefined && dados.cliente_id !== null;
    const temNome = typeof dados.comprador_nome === 'string' && dados.comprador_nome.trim() !== '';
    if (temCliente === temNome) {
      throw new ErroValidacao([{ campo: 'comprador_nome', mensagem: 'Informe um cliente cadastrado ou um nome avulso (não os dois)' }]);
    }
    if (temCliente && !clientes.obter(dados.cliente_id)) {
      throw new ErroValidacao([{ campo: 'cliente_id', mensagem: 'Cliente não encontrado' }]);
    }
    const modelo = modelos.obter(dados.modelo_id);
    if (!modelo) throw new ErroValidacao([{ campo: 'modelo_id', mensagem: 'Modelo não encontrado' }]);

    const itensDoModelo = itensModelo.listar({ modelo_id: modelo.id });
    if (!itensDoModelo.length) throw new ErroValidacao([{ campo: 'modelo_id', mensagem: 'Modelo sem receita cadastrada' }]);

    const lotesTodos = lotes.listar();
    let custoUnitario = 0;
    for (const item of itensDoModelo) {
      const custo = custoAtualMaterial(item.material_id, lotesTodos);
      if (custo === null) {
        throw new ErroValidacao([{ campo: 'modelo_id', mensagem: 'Algum material da receita ainda não tem lote comprado' }]);
      }
      custoUnitario += custo * item.quantidade;
    }

    const venda = vendas.criar({
      modelo_id: modelo.id,
      quantidade: dados.quantidade ?? 1,
      preco_vendido_centavos: dados.preco_vendido_centavos,
      custo_unitario_centavos: custoUnitario,
      cliente_id: temCliente ? dados.cliente_id : null,
      comprador_nome: temNome ? dados.comprador_nome.trim() : null,
      data_venda: dados.data_venda,
    });

    const vendasTodas = vendas.listar();
    const todosItensModelo = itensModelo.listar();
    const materiaisAfetados = itensDoModelo.map((i) => materiais.obter(i.material_id));
    const avisosEstoque = materiaisComEstoqueNegativo(materiaisAfetados, lotesTodos, vendasTodas, todosItensModelo)
      .map((m) => ({ material_id: m.id, nome: m.nome, estoque_atual: m.estoque_atual }));

    res.status(201).json({ venda: { ...venda, lucro_real_centavos: lucroRealVenda(venda) }, avisos_estoque: avisosEstoque });
  });

  r.put('/placas/vendas/:id', (req, res) => {
    const id = lerId(req.params.id);
    const dados = validar(req.body, REGRAS_VENDA, { parcial: true });
    const atualizada = vendas.atualizar(id, dados);
    if (!atualizada) throw naoEncontrado('Venda');
    res.json({ ...atualizada, lucro_real_centavos: lucroRealVenda(atualizada) });
  });

  r.delete('/placas/vendas/:id', (req, res) => {
    if (!vendas.remover(lerId(req.params.id))) throw naoEncontrado('Venda');
    res.status(204).end();
  });

  return r;
}
