import { Router } from 'express';
import { repoClientes } from '../repos/clientes.js';
import { repoProjetos } from '../repos/projetos.js';
import { repoQrcodes } from '../repos/qrcodes.js';
import { validar, lerId } from '../http/validar.js';
import { ErroHttp, ErroValidacao, naoEncontrado } from '../http/erros.js';
import { gerarCodigoPix } from '../domain/pix.js';
import { obterConfig } from '../repos/config.js';
import { validarRepo } from '../portfolio/validate.js';
import { gravarPix } from '../portfolio/pix.js';
import { commitarPix } from '../portfolio/git.js';

const CHAVE_REPO_PORTFOLIO = 'portfolio_repo_path';

export const REGRAS_CLIENTE = {
  nome: { tipo: 'texto', obrigatorio: true },
  empresa: { tipo: 'texto' },
  email: { tipo: 'texto' },
  telefone: { tipo: 'texto' },
  instagram: { tipo: 'texto' },
  origem: { tipo: 'texto' },
  notas: { tipo: 'texto' },
  chave_pix: { tipo: 'texto' },
  tipo_chave_pix: { tipo: 'enum', valores: ['cpf', 'cnpj', 'email', 'telefone', 'aleatoria'] },
  cidade: { tipo: 'texto' },
};

function exigirPixCompleto(dados, atual = {}) {
  const chave = dados.chave_pix !== undefined ? dados.chave_pix : atual.chave_pix;
  const tipo = dados.tipo_chave_pix !== undefined ? dados.tipo_chave_pix : atual.tipo_chave_pix;
  const cidade = dados.cidade !== undefined ? dados.cidade : atual.cidade;
  if (chave && (!tipo || !cidade)) {
    throw new ErroValidacao([{ campo: 'chave_pix', mensagem: 'Informe tipo de chave e cidade' }]);
  }
}

export function rotasClientes({ db }) {
  const clientes = repoClientes(db);
  const projetos = repoProjetos(db);
  const qrcodes = repoQrcodes(db);
  const r = Router();

  r.get('/', (req, res) => res.json(clientes.buscar(req.query.busca ?? '')));

  r.post('/', (req, res) => {
    const dados = validar(req.body, REGRAS_CLIENTE);
    exigirPixCompleto(dados);
    res.status(201).json(clientes.criar(dados));
  });

  r.get('/:id', (req, res) => {
    const cliente = clientes.obter(lerId(req.params.id));
    if (!cliente) throw naoEncontrado('Cliente');
    res.json({
      ...cliente,
      projetos: projetos.listarComCliente({ cliente_id: cliente.id }),
      qrcodes: qrcodes.listar({ cliente_id: cliente.id }),
      total_faturado_centavos: clientes.totalFaturado(cliente.id),
      pix_copia_cola: cliente.chave_pix
        ? gerarCodigoPix({ chave: cliente.chave_pix, nomeRecebedor: cliente.empresa || cliente.nome, cidade: cliente.cidade })
        : null,
    });
  });

  r.put('/:id', (req, res) => {
    const id = lerId(req.params.id);
    const atual = clientes.obter(id);
    if (!atual) throw naoEncontrado('Cliente');
    const dados = validar(req.body, REGRAS_CLIENTE, { parcial: true });
    exigirPixCompleto(dados, atual);
    res.json(clientes.atualizar(id, dados));
  });

  r.post('/:id/publicar-pix', (req, res) => {
    const cliente = clientes.obter(lerId(req.params.id));
    if (!cliente) throw naoEncontrado('Cliente');
    if (!cliente.chave_pix) throw new ErroHttp(400, 'Cadastre a chave Pix antes de publicar');
    const repo = obterConfig(db, CHAVE_REPO_PORTFOLIO);
    const erros = validarRepo(repo);
    if (erros.length) throw new ErroHttp(400, erros.join('\n'));
    const codigo = gerarCodigoPix({ chave: cliente.chave_pix, nomeRecebedor: cliente.empresa || cliente.nome, cidade: cliente.cidade });
    gravarPix(repo, { id: cliente.id, nome: cliente.empresa || cliente.nome, codigo });
    res.json(commitarPix(repo));
  });

  r.delete('/:id', (req, res) => {
    const id = lerId(req.params.id);
    if (clientes.contarProjetos(id) > 0) {
      throw new ErroHttp(409, 'Este cliente tem projetos. Exclua ou mova os projetos antes de excluir o cliente.');
    }
    if (clientes.contarQrcodes(id) > 0) {
      throw new ErroHttp(409, 'Este cliente tem QR codes. Exclua-os antes de excluir o cliente.');
    }
    if (!clientes.remover(id)) throw naoEncontrado('Cliente');
    res.status(204).end();
  });

  return r;
}
