import { Router } from 'express';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { repoQrcodes } from '../repos/qrcodes.js';
import { repoClientes } from '../repos/clientes.js';
import { criarUpload } from '../http/upload.js';
import { validar, lerId } from '../http/validar.js';
import { ErroHttp, ErroValidacao, naoEncontrado } from '../http/erros.js';

const CATEGORIAS_QR = ['avaliacao', 'cardapio'];
const STATUS_QR = ['ativo', 'arquivado'];
const EXTENSOES_QR = { 'image/png': '.png', 'application/pdf': '.pdf' };

export const REGRAS_QRCODE = {
  cliente_id: { tipo: 'inteiro', obrigatorio: true },
  nome: { tipo: 'texto', obrigatorio: true },
  categoria: { tipo: 'enum', valores: CATEGORIAS_QR, obrigatorio: true },
  descricao_local: { tipo: 'texto' },
  destino_atual: { tipo: 'texto', obrigatorio: true },
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

  function montar(id) {
    return { ...qrcodes.obter(id), historico: qrcodes.historico(id) };
  }

  function apagarArquivo(nomeArquivo) {
    if (nomeArquivo) rmSync(path.join(dataDir, 'uploads', nomeArquivo), { force: true });
  }

  r.get('/qrcodes', (req, res) => {
    res.json(qrcodes.listar({ cliente_id: req.query.cliente_id, status: req.query.status }));
  });

  r.post('/qrcodes', (req, res) => {
    const dados = validar(req.body, REGRAS_QRCODE);
    exigirCliente(dados.cliente_id);
    const criado = qrcodes.criar(dados);
    res.status(201).json(montar(criado.id));
  });

  r.get('/qrcodes/:id', (req, res) => {
    const id = lerId(req.params.id);
    if (!qrcodes.obter(id)) throw naoEncontrado('QR code');
    res.json(montar(id));
  });

  r.put('/qrcodes/:id', (req, res) => {
    const id = lerId(req.params.id);
    const dados = validar(req.body, REGRAS_QRCODE, { parcial: true });
    if (dados.cliente_id !== undefined) exigirCliente(dados.cliente_id);
    const atualizado = qrcodes.atualizar(id, dados);
    if (!atualizado) throw naoEncontrado('QR code');
    res.json(montar(id));
  });

  r.post('/qrcodes/:id/imagem', upload.single('imagem'), (req, res) => {
    const id = lerId(req.params.id);
    const qrcode = qrcodes.obter(id);
    if (!qrcode) throw naoEncontrado('QR code');
    if (!req.file) throw new ErroHttp(400, 'Nenhum arquivo enviado');
    apagarArquivo(qrcode.imagem_arquivo);
    qrcodes.atualizar(id, { imagem_arquivo: req.file.filename });
    res.json(montar(id));
  });

  r.delete('/qrcodes/:id/imagem', (req, res) => {
    const id = lerId(req.params.id);
    const qrcode = qrcodes.obter(id);
    if (!qrcode) throw naoEncontrado('QR code');
    apagarArquivo(qrcode.imagem_arquivo);
    qrcodes.atualizar(id, { imagem_arquivo: null });
    res.json(montar(id));
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
