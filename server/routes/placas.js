import { Router } from 'express';
import {
  repoPlacasMateriais, repoPlacasLotes, repoPlacasModelos, repoPlacasModelosItens, repoPlacasVendas,
  repoPlacasAvarias, repoPlacasAvariasItens, repoPlacasModelosPacks, precoSugeridoPlacas,
  repoPlacasMontagens, repoPlacasMontagensItens, idsVendasDeProjeto, montadasDisponiveis,
} from '../repos/placas.js';
import { repoClientes } from '../repos/clientes.js';
import { repoProjetosServicos } from '../repos/servicos.js';
import { emTransacao } from '../repos/crud.js';
import { validar, lerId } from '../http/validar.js';
import { ErroHttp, ErroValidacao, naoEncontrado } from '../http/erros.js';
import {
  estoqueMaterial, custoAtualMaterial, custoReceitaModelo, lucroPrevisto,
  lucroRealVenda, resumoLucroReal, materiaisComEstoqueNegativo,
  custoItensAvaria, resumoPrejuizoAvarias, calcularCustoUnitarioModelo,
  montadasDoModelo, quantasDaPraMontar, estadoVendaPlaca, valorVendaPlaca,
} from '../domain/placas.js';
import { mesDe } from '../domain/datas.js';

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

const REGRAS_MONTAGEM = {
  modelo_id: { tipo: 'inteiro', obrigatorio: true },
  quantidade: { tipo: 'inteiro', obrigatorio: true, min: 1 },
  data_montagem: { tipo: 'data', obrigatorio: true },
};

const REGRAS_AVARIA = {
  modelo_id: { tipo: 'inteiro', obrigatorio: true },
  quantidade: { tipo: 'inteiro', min: 1 },
  observacao: { tipo: 'texto' },
  data_avaria: { tipo: 'data', obrigatorio: true },
};

export function rotasPlacas({ db, hoje }) {
  const materiais = repoPlacasMateriais(db);
  const lotes = repoPlacasLotes(db);
  const modelos = repoPlacasModelos(db);
  const itensModelo = repoPlacasModelosItens(db);
  const packsModelo = repoPlacasModelosPacks(db);
  const vendas = repoPlacasVendas(db);
  const clientes = repoClientes(db);
  const avarias = repoPlacasAvarias(db);
  const itensAvaria = repoPlacasAvariasItens(db);
  const projetosServicos = repoProjetosServicos(db);
  const montagens = repoPlacasMontagens(db);
  const itensMontagem = repoPlacasMontagensItens(db);
  const r = Router();

  // Tudo o que entra no cálculo de estoque, lido uma vez por requisição.
  function lerEstoque() {
    return {
      lotes: lotes.listar(),
      vendas: vendas.listar(),
      itensModelo: itensModelo.listar(),
      avarias: avarias.listar(),
      itensAvaria: itensAvaria.listar(),
      montagens: montagens.listar(),
      itensMontagem: itensMontagem.listar(),
    };
  }

  const estoqueDe = (materialId, e) => estoqueMaterial(
    materialId, e.lotes, e.vendas, e.itensModelo, e.avarias, e.itensAvaria, e.montagens, e.itensMontagem,
  );

  function avisosEstoque(materialIds) {
    const e = lerEstoque();
    const afetados = [...new Set(materialIds)].map((id) => materiais.obter(id));
    return materiaisComEstoqueNegativo(afetados, e.lotes, e.vendas, e.itensModelo, e.avarias, e.itensAvaria, e.montagens, e.itensMontagem)
      .map((m) => ({ material_id: m.id, nome: m.nome, estoque_atual: m.estoque_atual }));
  }

  function comCalculo(material) {
    const e = lerEstoque();
    return {
      ...material,
      estoque_atual: estoqueDe(material.id, e),
      custo_unitario_atual: custoAtualMaterial(material.id, e.lotes),
    };
  }

  function montarVenda(venda, { modelosTodos = modelos.listar(), clientesTodos = clientes.listar(), deProjeto = idsVendasDeProjeto(db) } = {}) {
    return {
      ...venda,
      lucro_real_centavos: lucroRealVenda(venda),
      valor_total_centavos: valorVendaPlaca(venda),
      estado: estadoVendaPlaca(venda, hoje()),
      via_projeto: deProjeto.has(venda.id),
      modelo_nome: modelosTodos.find((m) => m.id === venda.modelo_id)?.nome ?? '—',
      cliente_nome: venda.cliente_id ? (clientesTodos.find((c) => c.id === venda.cliente_id)?.nome ?? '—') : null,
    };
  }

  function montarMontagem(montagem, modelosTodos = modelos.listar()) {
    return {
      ...montagem,
      modelo_nome: modelosTodos.find((m) => m.id === montagem.modelo_id)?.nome ?? '—',
      itens: itensMontagem.listar({ montagem_id: montagem.id })
        .map((i) => ({ ...i, material_nome: materiais.obter(i.material_id)?.nome ?? '—' })),
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

  function validarPacks(packsBrutos, precoVendaCentavos) {
    if (!Array.isArray(packsBrutos)) throw new ErroValidacao([{ campo: 'packs', mensagem: 'Deve ser uma lista' }]);
    const vistas = new Set();
    const packs = packsBrutos.map((pack, i) => {
      const quantidade = Number(pack.quantidade);
      const preco = Number(pack.preco_total_centavos);
      if (!Number.isInteger(quantidade) || quantidade < 2) {
        throw new ErroValidacao([{ campo: `packs[${i}].quantidade`, mensagem: 'Deve ser no mínimo 2' }]);
      }
      if (vistas.has(quantidade)) throw new ErroValidacao([{ campo: `packs[${i}].quantidade`, mensagem: 'Quantidade repetida' }]);
      vistas.add(quantidade);
      if (!Number.isInteger(preco) || preco < 0) {
        throw new ErroValidacao([{ campo: `packs[${i}].preco_total_centavos`, mensagem: 'Valor inválido' }]);
      }
      return { quantidade, preco_total_centavos: preco, indice: i };
    });
    const ordenados = [{ quantidade: 1, preco_total_centavos: precoVendaCentavos }, ...packs].sort((a, b) => a.quantidade - b.quantidade);
    for (let k = 1; k < ordenados.length; k++) {
      if (ordenados[k].preco_total_centavos < ordenados[k - 1].preco_total_centavos) {
        throw new ErroValidacao([{
          campo: `packs[${ordenados[k].indice}].preco_total_centavos`,
          mensagem: `Não pode ser menor que o pack de ${ordenados[k - 1].quantidade}`,
        }]);
      }
    }
    return packs.map(({ quantidade, preco_total_centavos }) => ({ quantidade, preco_total_centavos }));
  }

  function gravarPacks(modeloId, packs) {
    packsModelo.removerPorModelo(modeloId);
    for (const pack of packs) packsModelo.criar({ ...pack, modelo_id: modeloId });
  }

  function montarModelo(modelo) {
    const todosItens = itensModelo.listar();
    const custoReceita = custoReceitaModelo(modelo.id, todosItens, lotes.listar());
    return {
      ...modelo,
      itens: todosItens.filter((i) => i.modelo_id === modelo.id),
      packs: packsModelo.listar({ modelo_id: modelo.id }).map((p) => ({ quantidade: p.quantidade, preco_total_centavos: p.preco_total_centavos })),
      custo_previsto_centavos: custoReceita,
      lucro_previsto_centavos: lucroPrevisto(modelo, custoReceita),
    };
  }

  function montarAvaria(avaria) {
    return {
      ...avaria,
      itens: itensAvaria.listar({ avaria_id: avaria.id }),
      custo_total_centavos: avaria.custo_unitario_centavos * avaria.quantidade,
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
    if (itensAvaria.listar().some((i) => i.material_id === id)) {
      throw new ErroValidacao([{ campo: 'id', mensagem: 'Material está usado em uma avaria' }]);
    }
    if (itensMontagem.listar().some((i) => i.material_id === id)) {
      throw new ErroValidacao([{ campo: 'id', mensagem: 'Material está usado em uma montagem' }]);
    }
    materiais.remover(id);
    res.status(204).end();
  });

  r.post('/placas/materiais/:id/desativar', (req, res) => {
    const id = lerId(req.params.id);
    const atualizado = materiais.atualizar(id, { ativo: 0 });
    if (!atualizado) throw naoEncontrado('Material');
    res.json(comCalculo(atualizado));
  });

  r.post('/placas/materiais/:id/ativar', (req, res) => {
    const id = lerId(req.params.id);
    const atualizado = materiais.atualizar(id, { ativo: 1 });
    if (!atualizado) throw naoEncontrado('Material');
    res.json(comCalculo(atualizado));
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
    const packs = validarPacks(req.body.packs ?? [], dados.preco_venda_centavos);
    const criado = emTransacao(db, () => {
      const modelo = modelos.criar(dados);
      for (const item of itens) itensModelo.criar({ ...item, modelo_id: modelo.id });
      gravarPacks(modelo.id, packs);
      return modelo;
    });
    res.status(201).json(montarModelo(criado));
  });

  r.put('/placas/modelos/:id', (req, res) => {
    const id = lerId(req.params.id);
    const atual = modelos.obter(id);
    if (!atual) throw naoEncontrado('Modelo');
    const dados = validar(req.body, REGRAS_MODELO, { parcial: true });
    const itens = req.body.itens !== undefined ? validarItens(req.body.itens) : null;
    const precoVenda = dados.preco_venda_centavos ?? atual.preco_venda_centavos;
    let packs = null;
    if (req.body.packs !== undefined) packs = validarPacks(req.body.packs, precoVenda);
    else if (dados.preco_venda_centavos !== undefined) validarPacks(packsModelo.listar({ modelo_id: id }), precoVenda);
    emTransacao(db, () => {
      if (Object.keys(dados).length) modelos.atualizar(id, dados);
      if (itens) {
        itensModelo.removerPorModelo(id);
        for (const item of itens) itensModelo.criar({ ...item, modelo_id: id });
      }
      if (packs) gravarPacks(id, packs);
    });
    res.json(montarModelo(modelos.obter(id)));
  });

  r.delete('/placas/modelos/:id', (req, res) => {
    const id = lerId(req.params.id);
    if (!modelos.obter(id)) throw naoEncontrado('Modelo');
    if (vendas.listar().some((v) => v.modelo_id === id)) {
      throw new ErroValidacao([{ campo: 'id', mensagem: 'Modelo tem vendas vinculadas' }]);
    }
    if (avarias.listar().some((a) => a.modelo_id === id)) {
      throw new ErroValidacao([{ campo: 'id', mensagem: 'Modelo tem avarias vinculadas' }]);
    }
    if (montagens.listar().some((m) => m.modelo_id === id)) {
      throw new ErroValidacao([{ campo: 'id', mensagem: 'Modelo tem montagens vinculadas' }]);
    }
    emTransacao(db, () => {
      itensModelo.removerPorModelo(id);
      packsModelo.removerPorModelo(id);
      modelos.remover(id);
    });
    res.status(204).end();
  });

  r.post('/placas/modelos/:id/desativar', (req, res) => {
    const id = lerId(req.params.id);
    const atualizado = modelos.atualizar(id, { ativo: 0 });
    if (!atualizado) throw naoEncontrado('Modelo');
    res.json(montarModelo(atualizado));
  });

  r.post('/placas/modelos/:id/ativar', (req, res) => {
    const id = lerId(req.params.id);
    const atualizado = modelos.atualizar(id, { ativo: 1 });
    if (!atualizado) throw naoEncontrado('Modelo');
    res.json(montarModelo(atualizado));
  });

  r.get('/placas/modelos/:id/preco', (req, res) => {
    const modelo = modelos.obter(lerId(req.params.id));
    if (!modelo) throw naoEncontrado('Modelo');
    const quantidade = Number(req.query.quantidade);
    if (!Number.isInteger(quantidade) || quantidade < 1) {
      throw new ErroValidacao([{ campo: 'quantidade', mensagem: 'Deve ser no mínimo 1' }]);
    }
    const clienteId = Number(req.query.cliente_id) || null;
    const projetoId = Number(req.query.projeto_id) || null;
    res.json(precoSugeridoPlacas(db, { modelo, quantidade, clienteId, projetoId }));
  });

  r.get('/placas/vendas', (req, res) => {
    const contexto = { modelosTodos: modelos.listar(), clientesTodos: clientes.listar(), deProjeto: idsVendasDeProjeto(db) };
    res.json(vendas.listar().map((v) => montarVenda(v, contexto)));
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
    const resultadoCusto = calcularCustoUnitarioModelo(modelo.id, itensModelo.listar(), lotes.listar());
    if (resultadoCusto.erro === 'sem_receita') {
      throw new ErroValidacao([{ campo: 'modelo_id', mensagem: 'Modelo sem receita cadastrada' }]);
    }
    if (resultadoCusto.erro === 'sem_lote') {
      throw new ErroValidacao([{ campo: 'modelo_id', mensagem: 'Algum material da receita ainda não tem lote comprado' }]);
    }
    const custoUnitario = resultadoCusto.custoUnitarioCentavos;

    const quantidade = dados.quantidade ?? 1;
    const venda = vendas.criar({
      modelo_id: modelo.id,
      quantidade,
      preco_vendido_centavos: dados.preco_vendido_centavos,
      custo_unitario_centavos: custoUnitario,
      cliente_id: temCliente ? dados.cliente_id : null,
      comprador_nome: temNome ? dados.comprador_nome.trim() : null,
      data_venda: dados.data_venda,
      recebido_em: req.body.recebido === true ? dados.data_venda : null,
      quantidade_montada: Math.min(quantidade, Math.max(0, montadasDisponiveis(db, modelo.id))),
    });

    res.status(201).json({
      venda: montarVenda(venda),
      avisos_estoque: avisosEstoque(itensDoModelo.map((i) => i.material_id)),
    });
  });

  r.put('/placas/vendas/:id', (req, res) => {
    const id = lerId(req.params.id);
    const atual = vendas.obter(id);
    if (!atual) throw naoEncontrado('Venda');
    const dados = validar(req.body, REGRAS_VENDA, { parcial: true });
    if (dados.quantidade !== undefined || dados.modelo_id !== undefined) {
      const modeloId = dados.modelo_id ?? atual.modelo_id;
      const livres = Math.max(0, montadasDisponiveis(db, modeloId, { ignorarVendaId: id }));
      dados.quantidade_montada = Math.min(dados.quantidade ?? atual.quantidade, livres);
    }
    res.json(montarVenda(vendas.atualizar(id, dados)));
  });

  r.post('/placas/vendas/:id/recebimento', (req, res) => {
    const atualizada = vendas.atualizar(lerId(req.params.id), { recebido_em: hoje() });
    if (!atualizada) throw naoEncontrado('Venda');
    res.json(montarVenda(atualizada));
  });

  r.delete('/placas/vendas/:id/recebimento', (req, res) => {
    const atualizada = vendas.atualizar(lerId(req.params.id), { recebido_em: null });
    if (!atualizada) throw naoEncontrado('Venda');
    res.json(montarVenda(atualizada));
  });

  r.get('/placas/montagens', (req, res) => {
    const modelosTodos = modelos.listar();
    res.json(montagens.listar().map((m) => montarMontagem(m, modelosTodos)));
  });

  r.post('/placas/montagens', (req, res) => {
    const dados = validar(req.body, REGRAS_MONTAGEM);
    if (!modelos.obter(dados.modelo_id)) throw new ErroValidacao([{ campo: 'modelo_id', mensagem: 'Modelo não encontrado' }]);
    // Os materiais podem vir editados: valem só para esta montagem, ou viram a receita do modelo.
    const editados = req.body.itens !== undefined ? validarItens(req.body.itens) : null;
    if (editados && !editados.length) throw new ErroValidacao([{ campo: 'itens', mensagem: 'Informe ao menos um material' }]);
    const receita = editados ?? itensModelo.listar({ modelo_id: dados.modelo_id });
    if (!receita.length) throw new ErroValidacao([{ campo: 'modelo_id', mensagem: 'Modelo sem receita cadastrada' }]);
    const criada = emTransacao(db, () => {
      if (editados && req.body.atualizar_receita === true) {
        itensModelo.removerPorModelo(dados.modelo_id);
        for (const item of editados) itensModelo.criar({ ...item, modelo_id: dados.modelo_id });
      }
      const montagem = montagens.criar(dados);
      for (const item of receita) {
        itensMontagem.criar({ montagem_id: montagem.id, material_id: item.material_id, quantidade: item.quantidade });
      }
      return montagem;
    });
    res.status(201).json({
      montagem: montarMontagem(criada),
      avisos_estoque: avisosEstoque(receita.map((i) => i.material_id)),
    });
  });

  r.delete('/placas/montagens/:id', (req, res) => {
    const montagem = montagens.obter(lerId(req.params.id));
    if (!montagem) throw naoEncontrado('Montagem');
    if (montadasDisponiveis(db, montagem.modelo_id) - montagem.quantidade < 0) {
      throw new ErroHttp(409, 'Placas desta montagem já foram vendidas');
    }
    montagens.remover(montagem.id);
    res.status(204).end();
  });

  r.delete('/placas/vendas/:id', (req, res) => {
    const id = lerId(req.params.id);
    if (projetosServicos.projetoDaVenda(id)) {
      throw new ErroHttp(409, 'Esta venda está ligada a um serviço no perfil do cliente. Exclua o serviço por lá antes.');
    }
    if (!vendas.remover(id)) throw naoEncontrado('Venda');
    res.status(204).end();
  });

  r.get('/placas/avarias', (req, res) => {
    const modelosTodos = modelos.listar();
    res.json(avarias.listar().map((a) => ({
      ...montarAvaria(a),
      modelo_nome: modelosTodos.find((m) => m.id === a.modelo_id)?.nome ?? '—',
    })));
  });

  r.post('/placas/avarias', (req, res) => {
    const dados = validar(req.body, REGRAS_AVARIA);
    const modelo = modelos.obter(dados.modelo_id);
    if (!modelo) throw new ErroValidacao([{ campo: 'modelo_id', mensagem: 'Modelo não encontrado' }]);

    const itensBrutos = req.body.itens !== undefined
      ? req.body.itens
      : itensModelo.listar({ modelo_id: modelo.id }).map((i) => ({ material_id: i.material_id, quantidade: i.quantidade }));
    const itens = validarItens(itensBrutos);
    if (!itens.length) throw new ErroValidacao([{ campo: 'itens', mensagem: 'Informe ao menos um material consumido' }]);

    const lotesTodos = lotes.listar();
    const custoUnitario = custoItensAvaria(itens, lotesTodos);
    if (custoUnitario === null) {
      throw new ErroValidacao([{ campo: 'itens', mensagem: 'Algum material ainda não tem lote comprado' }]);
    }

    const quantidade = dados.quantidade ?? 1;
    const criada = emTransacao(db, () => {
      const avaria = avarias.criar({ ...dados, quantidade, custo_unitario_centavos: custoUnitario });
      for (const item of itens) itensAvaria.criar({ ...item, avaria_id: avaria.id });
      return avaria;
    });

    res.status(201).json({ avaria: montarAvaria(criada), avisos_estoque: avisosEstoque(itens.map((i) => i.material_id)) });
  });

  r.put('/placas/avarias/:id', (req, res) => {
    const id = lerId(req.params.id);
    if (!avarias.obter(id)) throw naoEncontrado('Avaria');
    const dados = validar(req.body, REGRAS_AVARIA, { parcial: true });
    const itens = req.body.itens !== undefined ? validarItens(req.body.itens) : null;
    if (itens) {
      if (!itens.length) throw new ErroValidacao([{ campo: 'itens', mensagem: 'Informe ao menos um material consumido' }]);
      const custoUnitario = custoItensAvaria(itens, lotes.listar());
      if (custoUnitario === null) {
        throw new ErroValidacao([{ campo: 'itens', mensagem: 'Algum material ainda não tem lote comprado' }]);
      }
      dados.custo_unitario_centavos = custoUnitario;
    }
    emTransacao(db, () => {
      if (Object.keys(dados).length) avarias.atualizar(id, dados);
      if (itens) {
        itensAvaria.removerPorAvaria(id);
        for (const item of itens) itensAvaria.criar({ ...item, avaria_id: id });
      }
    });
    res.json(montarAvaria(avarias.obter(id)));
  });

  r.delete('/placas/avarias/:id', (req, res) => {
    const id = lerId(req.params.id);
    if (!avarias.obter(id)) throw naoEncontrado('Avaria');
    emTransacao(db, () => {
      itensAvaria.removerPorAvaria(id);
      avarias.remover(id);
    });
    res.status(204).end();
  });

  r.get('/placas/resumo', (req, res) => {
    const materiaisTodos = materiais.listar();
    const modelosTodos = modelos.listar();
    const e = lerEstoque();
    const { lotes: lotesTodos, vendas: vendasTodas, itensModelo: todosItens, avarias: avariasTodas } = e;
    const estoquePorMaterial = new Map(materiaisTodos.map((m) => [m.id, estoqueDe(m.id, e)]));
    const contextoVenda = { modelosTodos, clientesTodos: clientes.listar(), deProjeto: idsVendasDeProjeto(db) };
    const aReceber = vendasTodas
      .filter((v) => !v.recebido_em && !contextoVenda.deProjeto.has(v.id))
      .map((v) => montarVenda(v, contextoVenda))
      .sort((a, b) => a.data_venda.localeCompare(b.data_venda) || a.id - b.id);
    const doMes = vendasTodas.filter((v) => mesDe(v.data_venda) === mesDe(hoje()));

    const lucroPrevistoPorModelo = modelosTodos.map((m) => {
      const custoReceita = custoReceitaModelo(m.id, todosItens, lotesTodos);
      return {
        modelo_id: m.id,
        modelo_nome: m.nome,
        preco_venda_centavos: m.preco_venda_centavos,
        custo_previsto_centavos: custoReceita,
        lucro_previsto_centavos: lucroPrevisto(m, custoReceita),
      };
    });

    const materiaisComEstoque = materiaisTodos.map((m) => ({
      material_id: m.id,
      nome: m.nome,
      estoque_atual: estoquePorMaterial.get(m.id),
    }));

    res.json({
      a_receber: {
        total_centavos: aReceber.reduce((s, v) => s + v.valor_total_centavos, 0),
        vendas: aReceber,
      },
      montadas: modelosTodos.filter((m) => m.ativo).map((m) => ({
        modelo_id: m.id,
        modelo_nome: m.nome,
        montadas: montadasDoModelo(m.id, e.montagens, vendasTodas),
        da_pra_montar: quantasDaPraMontar(m.id, todosItens, estoquePorMaterial),
      })),
      mes: {
        vendidas: doMes.reduce((s, v) => s + v.quantidade, 0),
        lucro_centavos: doMes.reduce((s, v) => s + lucroRealVenda(v), 0),
      },
      lucro_previsto_por_modelo: lucroPrevistoPorModelo,
      lucro_real_por_modelo: resumoLucroReal(vendasTodas).map((rl) => ({
        ...rl,
        modelo_nome: modelosTodos.find((m) => m.id === rl.modelo_id)?.nome ?? '—',
      })),
      materiais: materiaisComEstoque,
      prejuizo_avarias: resumoPrejuizoAvarias(avariasTodas, modelosTodos),
    });
  });

  return r;
}
