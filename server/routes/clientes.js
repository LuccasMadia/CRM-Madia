import { Router } from 'express';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { repoClientes } from '../repos/clientes.js';
import { criarUpload, removerArquivos } from '../http/upload.js';
import { repoProjetos } from '../repos/projetos.js';
import { repoLojas } from '../repos/lojas.js';
import { repoPlacasVendas, idsVendasDeProjeto } from '../repos/placas.js';
import { estadoVendaPlaca, valorVendaPlaca } from '../domain/placas.js';
import { validar, lerId } from '../http/validar.js';
import { ErroHttp, ErroValidacao, naoEncontrado } from '../http/erros.js';

export const REGRAS_CLIENTE = {
  nome: { tipo: 'texto', obrigatorio: true },
  responsavel: { tipo: 'texto' },
  email: { tipo: 'texto' },
  telefone: { tipo: 'texto' },
  instagram: { tipo: 'texto' },
  origem: { tipo: 'texto' },
  notas: { tipo: 'texto' },
};

const REGRAS_LOJA = {
  nome: { tipo: 'texto', obrigatorio: true },
  responsavel: { tipo: 'texto' },
};

export function rotasClientes({ db, hoje, dataDir }) {
  const clientes = repoClientes(db);
  const projetos = repoProjetos(db);
  const vendasPlacas = repoPlacasVendas(db);
  const lojas = repoLojas(db);
  const upload = criarUpload(dataDir);
  const apagarFoto = (foto) => foto && rmSync(path.join(dataDir, 'uploads', foto), { force: true });
  const r = Router();

  r.get('/', (req, res) => res.json(clientes.buscar(req.query.busca ?? '')));

  r.post('/', (req, res) => {
    const dados = validar(req.body, REGRAS_CLIENTE);
    res.status(201).json(clientes.criar(dados));
  });

  r.get('/:id', (req, res) => {
    const cliente = clientes.obter(lerId(req.params.id));
    if (!cliente) throw naoEncontrado('Cliente');
    res.json({
      ...cliente,
      projetos: projetos.listarComCliente({ cliente_id: cliente.id }),
      lojas: lojas.listarDoCliente(cliente.id),
      total_faturado_centavos: clientes.totalFaturado(cliente.id),
    });
  });

  r.get('/:id/placas', (req, res) => {
    const cliente = clientes.obter(lerId(req.params.id));
    if (!cliente) throw naoEncontrado('Cliente');
    const deProjeto = idsVendasDeProjeto(db);
    res.json({
      vendas_avulsas: vendasPlacas.listarAvulsasDoCliente(cliente.id),
      vendas: vendasPlacas.listarDoCliente(cliente.id)
        .map((v) => ({ ...v, estado: estadoVendaPlaca(v, hoje()), valor_total_centavos: valorVendaPlaca(v), via_projeto: deProjeto.has(v.id) })),
      ja_comprou: vendasPlacas.quantidadeDoCliente(cliente.id),
    });
  });

  const carregarCliente = (param) => {
    const cliente = clientes.obter(lerId(param));
    if (!cliente) throw naoEncontrado('Cliente');
    return cliente;
  };
  const carregarLoja = (cliente, param) => {
    const loja = lojas.obter(lerId(param));
    if (!loja || loja.cliente_id !== cliente.id) throw naoEncontrado('Loja');
    return loja;
  };

  // As rotas de loja devolvem a lista atualizada das lojas do cliente.
  r.post('/:id/lojas', (req, res) => {
    const cliente = carregarCliente(req.params.id);
    lojas.criar({ ...validar(req.body, REGRAS_LOJA), cliente_id: cliente.id });
    res.status(201).json(lojas.listarDoCliente(cliente.id));
  });

  r.put('/:id/lojas/:lojaId', (req, res) => {
    const cliente = carregarCliente(req.params.id);
    const loja = carregarLoja(cliente, req.params.lojaId);
    lojas.atualizar(loja.id, validar(req.body, REGRAS_LOJA, { parcial: true }));
    res.json(lojas.listarDoCliente(cliente.id));
  });

  r.delete('/:id/lojas/:lojaId', (req, res) => {
    const cliente = carregarCliente(req.params.id);
    lojas.remover(carregarLoja(cliente, req.params.lojaId).id);
    res.json(lojas.listarDoCliente(cliente.id));
  });

  r.put('/:id', (req, res) => {
    const id = lerId(req.params.id);
    const atual = clientes.obter(id);
    if (!atual) throw naoEncontrado('Cliente');
    const dados = validar(req.body, REGRAS_CLIENTE, { parcial: true });
    res.json(clientes.atualizar(id, dados));
  });

  r.delete('/:id', (req, res) => {
    const id = lerId(req.params.id);
    if (clientes.contarProjetos(id) > 0) {
      throw new ErroHttp(409, 'Este cliente tem projetos. Exclua ou mova os projetos antes de excluir o cliente.');
    }
    const foto = clientes.obter(id)?.foto;
    // QR codes saíram do app; os que sobraram no banco vão junto com o cliente
    if (!clientes.removerComQrcodes(id)) throw naoEncontrado('Cliente');
    apagarFoto(foto);
    res.status(204).end();
  });

  r.post('/:id/foto', upload.single('foto'), (req, res) => {
    let atual;
    try {
      atual = clientes.obter(lerId(req.params.id));
      if (!atual) throw naoEncontrado('Cliente');
      if (!req.file) throw new ErroValidacao([{ campo: 'foto', mensagem: 'Envie uma imagem' }]);
    } catch (erro) {
      removerArquivos(req.file ? [req.file] : []);
      throw erro;
    }
    const atualizado = clientes.atualizar(atual.id, { foto: req.file.filename });
    apagarFoto(atual.foto);
    res.json(atualizado);
  });

  r.delete('/:id/foto', (req, res) => {
    const atual = clientes.obter(lerId(req.params.id));
    if (!atual) throw naoEncontrado('Cliente');
    const atualizado = clientes.atualizar(atual.id, { foto: null });
    apagarFoto(atual.foto);
    res.json(atualizado);
  });

  return r;
}
