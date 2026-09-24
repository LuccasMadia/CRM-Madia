import { Router } from 'express';
import { criarRepo, linha, emTransacao } from '../repos/crud.js';
import { repoProjetos } from '../repos/projetos.js';
import { validar, lerId } from '../http/validar.js';
import { ErroHttp, naoEncontrado } from '../http/erros.js';
import { estadoParcela, resumoParcelas, recebidoPorMes } from '../domain/financeiro.js';
import { mesDe, somarMeses } from '../domain/datas.js';

const REGRAS_PARCELA = {
  descricao: { tipo: 'texto' },
  valor_centavos: { tipo: 'inteiro', obrigatorio: true, min: 1 },
  vencimento: { tipo: 'data', obrigatorio: true },
  pago_em: { tipo: 'data' },
};
const REGRAS_LOTE = {
  quantidade: { tipo: 'inteiro', obrigatorio: true, min: 1, max: 60 },
  valor_centavos: { tipo: 'inteiro', obrigatorio: true, min: 1 },
  primeira_vencimento: { tipo: 'data', obrigatorio: true },
};
const ESTADOS = ['paga', 'atrasada', 'pendente'];

export function rotasParcelas({ db, hoje }) {
  const parcelas = criarRepo(db, 'parcelas', ['projeto_id', 'descricao', 'valor_centavos', 'vencimento', 'pago_em']);
  const projetos = repoProjetos(db);
  const r = Router();
  const comEstado = (p) => ({ ...p, estado: estadoParcela(p, hoje()) });

  function exigirProjeto(req) {
    const projeto = projetos.obter(lerId(req.params.id));
    if (!projeto) throw naoEncontrado('Projeto');
    return projeto;
  }

  r.get('/projetos/:id/parcelas', (req, res) => {
    const projeto = exigirProjeto(req);
    const lista = parcelas.listar({ projeto_id: projeto.id }, 'vencimento, id');
    res.json({
      parcelas: lista.map(comEstado),
      resumo: resumoParcelas(lista, hoje(), projeto.valor_total_centavos),
    });
  });

  r.post('/projetos/:id/parcelas', (req, res) => {
    const projeto = exigirProjeto(req);
    const criada = parcelas.criar({ ...validar(req.body, REGRAS_PARCELA), projeto_id: projeto.id });
    res.status(201).json(comEstado(criada));
  });

  r.post('/projetos/:id/parcelas/lote', (req, res) => {
    const projeto = exigirProjeto(req);
    const { quantidade, valor_centavos, primeira_vencimento } = validar(req.body, REGRAS_LOTE);
    const criadas = emTransacao(db, () =>
      Array.from({ length: quantidade }, (_, i) =>
        parcelas.criar({
          projeto_id: projeto.id,
          descricao: `Parcela ${i + 1}/${quantidade}`,
          valor_centavos,
          vencimento: somarMeses(primeira_vencimento, i),
        }),
      ),
    );
    res.status(201).json(criadas.map(comEstado));
  });

  r.put('/parcelas/:id', (req, res) => {
    const atualizada = parcelas.atualizar(lerId(req.params.id), validar(req.body, REGRAS_PARCELA, { parcial: true }));
    if (!atualizada) throw naoEncontrado('Parcela');
    res.json(comEstado(atualizada));
  });

  r.delete('/parcelas/:id', (req, res) => {
    if (!parcelas.remover(lerId(req.params.id))) throw naoEncontrado('Parcela');
    res.status(204).end();
  });

  r.get('/parcelas', (req, res) => {
    const { estado, mes } = req.query;
    if (estado && !ESTADOS.includes(estado)) throw new ErroHttp(400, 'Estado inválido');
    if (mes && !/^\d{4}-\d{2}$/.test(mes)) throw new ErroHttp(400, 'Mês inválido (use AAAA-MM)');
    const lista = db
      .prepare(
        `SELECT pa.*, p.titulo AS projeto_titulo, c.nome AS cliente_nome
         FROM parcelas pa JOIN projetos p ON p.id = pa.projeto_id JOIN clientes c ON c.id = p.cliente_id
         ORDER BY pa.vencimento, pa.id`,
      )
      .all()
      .map((row) => comEstado(linha(row)))
      .filter((p) => (!estado || p.estado === estado) && (!mes || mesDe(p.vencimento) === mes));
    res.json(lista);
  });

  r.get('/financeiro/mensal', (req, res) => {
    const ano = Number(req.query.ano ?? hoje().slice(0, 4));
    if (!Number.isInteger(ano)) throw new ErroHttp(400, 'Ano inválido');
    res.json(recebidoPorMes(parcelas.listar(), ano));
  });

  return r;
}
