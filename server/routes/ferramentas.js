import { Router } from 'express';
import { repoFerramentas, repoRecargas } from '../repos/ferramentas.js';
import { validar, lerId } from '../http/validar.js';
import { ErroHttp, ErroValidacao, naoEncontrado } from '../http/erros.js';
import { mesDe } from '../domain/datas.js';

const REGRAS = {
  nome: { tipo: 'texto', obrigatorio: true },
  cobranca: { tipo: 'enum', valores: ['mensalidade', 'creditos'], obrigatorio: true },
  valor_centavos: { tipo: 'inteiro', min: 0 },
  dia_cobranca: { tipo: 'inteiro', min: 1, max: 31 },
  ativa: { tipo: 'bool' },
  observacao: { tipo: 'texto' },
};

const REGRAS_RECARGA = {
  data: { tipo: 'data', obrigatorio: true },
  valor_centavos: { tipo: 'inteiro', min: 1, obrigatorio: true },
};

// Créditos não têm valor fixo nem dia; mensalidade precisa do valor (olhando o registro já salvo numa edição).
function ajustarCobranca(dados, atual = {}) {
  const cobranca = dados.cobranca ?? atual.cobranca;
  if (cobranca === 'creditos') return { ...dados, valor_centavos: null, dia_cobranca: null };
  const valor = 'valor_centavos' in dados ? dados.valor_centavos : atual.valor_centavos;
  if (valor === null || valor === undefined) throw new ErroValidacao([{ campo: 'valor_centavos', mensagem: 'Obrigatório' }]);
  return dados;
}

export function rotasFerramentas({ db, hoje }) {
  const r = Router();
  const ferramentas = repoFerramentas(db);
  const recargas = repoRecargas(db);

  r.get('/', (req, res) => {
    const mes = req.query.mes ?? mesDe(hoje());
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new ErroValidacao([{ campo: 'mes', mensagem: 'Mês inválido (use AAAA-MM)' }]);
    const lista = ferramentas.listarComGasto(mes);
    res.json({ mes, ferramentas: lista, total_mes_centavos: lista.reduce((s, f) => s + f.gasto_mes_centavos, 0) });
  });

  r.post('/', (req, res) => {
    res.status(201).json(ferramentas.criar(ajustarCobranca(validar(req.body, REGRAS))));
  });

  r.put('/:id', (req, res) => {
    const id = lerId(req.params.id);
    const atual = ferramentas.obter(id);
    if (!atual) throw naoEncontrado('Ferramenta');
    res.json(ferramentas.atualizar(id, ajustarCobranca(validar(req.body, REGRAS, { parcial: true }), atual)));
  });

  r.delete('/recargas/:id', (req, res) => {
    if (!recargas.remover(lerId(req.params.id))) throw naoEncontrado('Recarga');
    res.status(204).end();
  });

  r.delete('/:id', (req, res) => {
    if (!ferramentas.remover(lerId(req.params.id))) throw naoEncontrado('Ferramenta');
    res.status(204).end();
  });

  function exigirCreditos(id) {
    const ferramenta = ferramentas.obter(id);
    if (!ferramenta) throw naoEncontrado('Ferramenta');
    if (ferramenta.cobranca !== 'creditos') throw new ErroHttp(409, 'Só ferramentas de créditos têm recargas');
  }

  r.get('/:id/recargas', (req, res) => {
    const id = lerId(req.params.id);
    exigirCreditos(id);
    res.json(recargas.listarDa(id));
  });

  r.post('/:id/recargas', (req, res) => {
    const id = lerId(req.params.id);
    exigirCreditos(id);
    res.status(201).json(recargas.criar({ ...validar(req.body, REGRAS_RECARGA), ferramenta_id: id }));
  });

  return r;
}
