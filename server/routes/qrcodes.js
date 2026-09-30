import { Router } from 'express';
import { repoQrcodes } from '../repos/qrcodes.js';
import { repoClientes } from '../repos/clientes.js';
import { validar, lerId } from '../http/validar.js';
import { ErroValidacao, naoEncontrado } from '../http/erros.js';

const CATEGORIAS_QR = ['adesivo', 'cardapio', 'panfleto', 'embalagem', 'outro'];
const STATUS_QR = ['ativo', 'arquivado'];

export const REGRAS_QRCODE = {
  cliente_id: { tipo: 'inteiro', obrigatorio: true },
  nome: { tipo: 'texto', obrigatorio: true },
  categoria: { tipo: 'enum', valores: CATEGORIAS_QR, obrigatorio: true },
  descricao_local: { tipo: 'texto' },
  destino_atual: { tipo: 'texto', obrigatorio: true },
  status: { tipo: 'enum', valores: STATUS_QR, padrao: 'ativo' },
};

export function rotasQrcodes({ db }) {
  const qrcodes = repoQrcodes(db);
  const clientes = repoClientes(db);
  const r = Router();

  function exigirCliente(clienteId) {
    if (!clientes.obter(clienteId)) {
      throw new ErroValidacao([{ campo: 'cliente_id', mensagem: 'Cliente não encontrado' }]);
    }
  }

  r.get('/qrcodes', (req, res) => {
    res.json(qrcodes.listar({ cliente_id: req.query.cliente_id, status: req.query.status }));
  });

  r.post('/qrcodes', (req, res) => {
    const dados = validar(req.body, REGRAS_QRCODE);
    exigirCliente(dados.cliente_id);
    res.status(201).json(qrcodes.criar(dados));
  });

  r.get('/qrcodes/:id', (req, res) => {
    const qrcode = qrcodes.obter(lerId(req.params.id));
    if (!qrcode) throw naoEncontrado('QR code');
    res.json({ ...qrcode, historico: qrcodes.historico(qrcode.id) });
  });

  return r;
}
