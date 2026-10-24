import { Router } from 'express';
import { linha, emTransacao } from '../repos/crud.js';
import { repoParcelas } from '../repos/parcelas.js';
import { repoProjetos } from '../repos/projetos.js';
import { gerarMensalidades, gerarTodasMensalidades } from '../repos/mensalidades.js';
import { validar, lerId } from '../http/validar.js';
import { ErroHttp, naoEncontrado } from '../http/erros.js';
import { estadoParcela, resumoParcelas, recebidoPorMes } from '../domain/financeiro.js';
import { mesDe, somarMeses } from '../domain/datas.js';
import { SERVICOS } from '../domain/servicos.js';
import { vendasPlacasComoParcelas } from '../repos/placas.js';
import { repoProjetosCategorias } from '../repos/categorias.js';
import { repoHospedagens } from '../repos/hospedagens.js';
import { situacaoMensalidade, tipoDaMensalidade } from '../domain/mensalidade.js';
import { concluirPorRecebimento, avisarRecebimentoDesfeito } from '../repos/tarefas.js';

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
  const parcelas = repoParcelas(db);
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
    gerarMensalidades(db, projeto, hoje());
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
    const id = lerId(req.params.id);
    const antes = parcelas.obter(id);
    if (!antes) throw naoEncontrado('Parcela');
    const dados = validar(req.body, REGRAS_PARCELA, { parcial: true });
    // Marcar paga fecha as tarefas de cobrança ligadas; desmarcar só deixa um comentário nelas.
    const atualizada = emTransacao(db, () => {
      const nova = parcelas.atualizar(id, dados);
      if (!antes.pago_em && nova.pago_em) concluirPorRecebimento(db, { parcela_id: id }, hoje());
      if (antes.pago_em && !nova.pago_em) avisarRecebimentoDesfeito(db, { parcela_id: id }, hoje());
      return nova;
    });
    res.json(comEstado(atualizada));
  });

  r.delete('/parcelas/:id', (req, res) => {
    if (!parcelas.remover(lerId(req.params.id))) throw naoEncontrado('Parcela');
    res.status(204).end();
  });

  r.get('/parcelas', (req, res) => {
    gerarTodasMensalidades(db, hoje());
    const { estado, mes, servico } = req.query;
    if (estado && !ESTADOS.includes(estado)) throw new ErroHttp(400, 'Estado inválido');
    if (mes && !/^\d{4}-\d{2}$/.test(mes)) throw new ErroHttp(400, 'Mês inválido (use AAAA-MM)');
    if (servico && !SERVICOS.includes(servico)) throw new ErroHttp(400, 'Serviço inválido');
    const lista = db
      .prepare(
        `SELECT pa.*, p.titulo AS projeto_titulo, p.servico, p.cliente_id, c.nome AS cliente_nome
         FROM parcelas pa JOIN projetos p ON p.id = pa.projeto_id JOIN clientes c ON c.id = p.cliente_id
         WHERE p.ficticio = 0
         ORDER BY pa.vencimento, pa.id`,
      )
      .all()
      .map((row) => ({ tipo: 'parcela', ...comEstado(linha(row)) }))
      .concat(vendasPlacasComoParcelas(db, hoje()))
      .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
      .filter((p) => (!estado || p.estado === estado) && (!mes || mesDe(p.vencimento) === mes) && (!servico || p.servico === servico));
    res.json(lista);
  });

  // Tudo vem do cadastro do projeto e das mensalidades que ele gerou: aqui nada é guardado à parte.
  r.get('/financeiro/mensalidades', (req, res) => {
    gerarTodasMensalidades(db, hoje());
    const dia = hoje();
    const categorias = repoProjetosCategorias(db);
    const hospedagens = repoHospedagens(db);
    const lista = db
      .prepare(
        `SELECT p.*, c.nome AS cliente_nome FROM projetos p JOIN clientes c ON c.id = p.cliente_id
         WHERE p.ficticio = 0 AND (p.mensalidade_ativa = 1 OR EXISTS (
           SELECT 1 FROM parcelas pa WHERE pa.projeto_id = p.id AND pa.mensalidade = 1 AND pa.pago_em IS NULL))
         ORDER BY c.nome COLLATE NOCASE, p.id`,
      )
      .all()
      .map(linha)
      .map((p) => {
        const hospedagem = p.servico === 'site_sistema' ? hospedagens.obter(p.id) : null;
        return {
          projeto_id: p.id,
          cliente_id: p.cliente_id,
          cliente_nome: p.cliente_nome,
          titulo: p.titulo,
          servico: p.servico,
          etapa: p.etapa,
          tipo: tipoDaMensalidade(p.servico, categorias.listar(p.id).map((c) => c.nome)),
          mensalidade_ativa: p.mensalidade_ativa,
          mensalidade_valor_centavos: p.mensalidade_valor_centavos,
          mensalidade_dia_vencimento: p.mensalidade_dia_vencimento,
          mensalidade_inicio_modo: p.mensalidade_inicio_modo,
          mensalidade_inicio_data: p.mensalidade_inicio_data,
          data_inicio: p.data_inicio,
          data_entrega: p.data_entrega,
          hospedagem: hospedagem && { tipo: hospedagem.tipo, status: hospedagem.status, url: hospedagem.url },
          ...situacaoMensalidade(p, parcelas.listar({ projeto_id: p.id, mensalidade: 1 }), dia),
        };
      });
    const cobrando = lista.filter((m) => ['em_dia', 'atrasada'].includes(m.situacao));
    res.json({
      resumo: {
        por_mes_centavos: cobrando.reduce((s, m) => s + m.mensalidade_valor_centavos, 0),
        cobrando: cobrando.length,
        a_comecar_centavos: lista.filter((m) => m.situacao === 'aguardando').reduce((s, m) => s + m.mensalidade_valor_centavos, 0),
        a_comecar: lista.filter((m) => m.situacao === 'aguardando').length,
        atrasado_centavos: lista.reduce((s, m) => s + m.atrasado_centavos, 0),
        atrasadas: lista.filter((m) => m.atrasadas > 0).length,
      },
      itens: lista,
    });
  });

  r.get('/financeiro/mensal', (req, res) => {
    gerarTodasMensalidades(db, hoje());
    const ano = Number(req.query.ano ?? hoje().slice(0, 4));
    if (!Number.isInteger(ano)) throw new ErroHttp(400, 'Ano inválido');
    const lista = db
      .prepare('SELECT pa.* FROM parcelas pa JOIN projetos p ON p.id = pa.projeto_id WHERE p.ficticio = 0')
      .all()
      .map(linha);
    res.json(recebidoPorMes([...lista, ...vendasPlacasComoParcelas(db, hoje())], ano));
  });

  return r;
}
