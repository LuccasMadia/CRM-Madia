import { Router } from 'express';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { repoQrcodes } from '../repos/qrcodes.js';
import { repoClientes } from '../repos/clientes.js';
import { emTransacao } from '../repos/crud.js';
import { criarUpload } from '../http/upload.js';
import { validar, lerId } from '../http/validar.js';
import { ErroHttp, ErroValidacao, naoEncontrado } from '../http/erros.js';
import { REGRAS_CLIENTE } from './clientes.js';

const CATEGORIAS_QR = ['avaliacao', 'cardapio'];
const STATUS_QR = ['ativo', 'arquivado'];
const EXTENSOES_QR = { 'image/png': '.png', 'application/pdf': '.pdf' };

export const REGRAS_QRCODE = {
  cliente_id: { tipo: 'inteiro', obrigatorio: true },
  nome: { tipo: 'texto', obrigatorio: true },
  categoria: { tipo: 'enum', valores: CATEGORIAS_QR, obrigatorio: true },
  descricao_local: { tipo: 'texto' },
  status: { tipo: 'enum', valores: STATUS_QR, padrao: 'ativo' },
};

export function rotasQrcodes({ db, dataDir }) {
  const qrcodes = repoQrcodes(db);
  const clientes = repoClientes(db);
  const upload = criarUpload(dataDir, EXTENSOES_QR);
  const r = Router();

  function exigirCliente(clienteId) {
    if (!clientes.obter(clienteId)) {
      throw new ErroValidacao([{ campo: 'cliente_id', mensagem: 'Cliente não encontrado' }]);
    }
  }

  function apagarArquivo(nomeArquivo) {
    if (nomeArquivo) rmSync(path.join(dataDir, 'uploads', nomeArquivo), { force: true });
  }

  r.get('/qrcodes', (req, res) => {
    res.json(qrcodes.listar({ cliente_id: req.query.cliente_id, status: req.query.status }));
  });

  r.post('/qrcodes', (req, res) => {
    const corpo = req.body ?? {};
    if (corpo.novo_cliente) {
      let dadosCliente;
      try {
        dadosCliente = validar(corpo.novo_cliente, REGRAS_CLIENTE);
      } catch (erro) {
        if (!(erro instanceof ErroValidacao)) throw erro;
        throw new ErroValidacao(erro.erros.map((e) => ({ ...e, campo: `novo_cliente.${e.campo}` })));
      }
      const { cliente_id: _ignorado, ...regrasSemCliente } = REGRAS_QRCODE;
      const dados = validar(corpo, regrasSemCliente);
      const criado = emTransacao(db, () => {
        const cliente = clientes.criar(dadosCliente);
        return qrcodes.criar({ ...dados, cliente_id: cliente.id });
      });
      return res.status(201).json(criado);
    }
    const dados = validar(corpo, REGRAS_QRCODE);
    exigirCliente(dados.cliente_id);
    res.status(201).json(qrcodes.criar(dados));
  });

  r.get('/qrcodes/:id', (req, res) => {
    const qrcode = qrcodes.obter(lerId(req.params.id));
    if (!qrcode) throw naoEncontrado('QR code');
    res.json(qrcode);
  });

  r.put('/qrcodes/:id', (req, res) => {
    const id = lerId(req.params.id);
    const dados = validar(req.body, REGRAS_QRCODE, { parcial: true });
    if (dados.cliente_id !== undefined) exigirCliente(dados.cliente_id);
    const atualizado = qrcodes.atualizar(id, dados);
    if (!atualizado) throw naoEncontrado('QR code');
    res.json(atualizado);
  });

  r.post('/qrcodes/:id/imagem', upload.single('imagem'), (req, res) => {
    const id = lerId(req.params.id);
    const qrcode = qrcodes.obter(id);
    if (!qrcode) throw naoEncontrado('QR code');
    if (!req.file) throw new ErroHttp(400, 'Nenhum arquivo enviado');
    apagarArquivo(qrcode.imagem_arquivo);
    res.json(qrcodes.atualizar(id, { imagem_arquivo: req.file.filename }));
  });

  r.delete('/qrcodes/:id/imagem', (req, res) => {
    const id = lerId(req.params.id);
    const qrcode = qrcodes.obter(id);
    if (!qrcode) throw naoEncontrado('QR code');
    apagarArquivo(qrcode.imagem_arquivo);
    res.json(qrcodes.atualizar(id, { imagem_arquivo: null }));
  });

  r.delete('/qrcodes/:id', (req, res) => {
    const id = lerId(req.params.id);
    const qrcode = qrcodes.obter(id);
    if (!qrcode) throw naoEncontrado('QR code');
    apagarArquivo(qrcode.imagem_arquivo);
    qrcodes.remover(id);
    res.status(204).end();
  });

  return r;
}
