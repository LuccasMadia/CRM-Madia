import { linha } from '../repos/crud.js';
import { estadoParcela } from '../domain/financeiro.js';
import { vendasPlacasComoParcelas } from '../repos/placas.js';
import { ORDEM_ETAPAS } from '../domain/orcamentos.js';
import { SERVICOS_ORDEM, tarefaVencida, entregueRelevante } from '../domain/cerebro.js';

const soma = (itens) => itens.reduce((s, i) => s + i.valor_centavos, 0);
const porProjeto = (itens) => {
  const mapa = new Map();
  for (const i of itens) mapa.set(i.projeto_id, [...(mapa.get(i.projeto_id) ?? []), i]);
  return mapa;
};

// Ordena pelo funil e depois pelo prazo (sem prazo por último).
const ordenar = (a, b) =>
  ORDEM_ETAPAS.indexOf(a.etapa) - ORDEM_ETAPAS.indexOf(b.etapa)
  || (a.prazo_entrega === null) - (b.prazo_entrega === null)
  || (a.prazo_entrega ?? '').localeCompare(b.prazo_entrega ?? '')
  || a.projeto_id - b.projeto_id;

// Chame gerarTodasMensalidades(db, hoje) antes, para as parcelas de mensalidade estarem em dia.
export function montarRelatorioProjetos(db, hoje) {
  const todas = (sql) => db.prepare(sql).all().map(linha);

  const projetos = todas(
    `SELECT p.*, c.nome AS cliente_nome FROM projetos p JOIN clientes c ON c.id = p.cliente_id
     WHERE p.ficticio = 0 AND p.etapa <> 'perdido'`,
  );
  const tarefasLista = todas(
    `SELECT t.id, t.texto, t.prazo, t.concluida, t.projeto_id, p.titulo AS projeto_titulo
     FROM tarefas t JOIN projetos p ON p.id = t.projeto_id
     WHERE p.ficticio = 0 AND p.etapa <> 'perdido' ORDER BY t.ordem, t.id`,
  );
  const tarefas = porProjeto(tarefasLista);
  // Mesma base do painel: parcelas de projeto não fictício + vendas de placa avulsas.
  const parcelas = todas(
    `SELECT pa.*, p.titulo AS projeto_titulo, c.nome AS cliente_nome FROM parcelas pa
     JOIN projetos p ON p.id = pa.projeto_id JOIN clientes c ON c.id = p.cliente_id WHERE p.ficticio = 0`,
  );
  const vendasAbertas = vendasPlacasComoParcelas(db, hoje).filter((v) => !v.pago_em);
  const parcelasAbertas = parcelas.filter((p) => !p.pago_em);
  const atrasadas = [
    ...parcelasAbertas.filter((p) => estadoParcela(p, hoje) === 'atrasada'),
    ...vendasAbertas.filter((v) => v.estado === 'atrasada'),
  ];
  const parcelasPorProjeto = porProjeto(parcelas);

  const fichas = projetos.map((p) => {
    const ts = tarefas.get(p.id) ?? [];
    const ps = parcelasPorProjeto.get(p.id) ?? [];
    const abertas = ts.filter((t) => !t.concluida)
      .map((t) => ({ id: t.id, texto: t.texto, prazo: t.prazo, vencida: tarefaVencida(t, hoje) }));
    const naoPagas = ps.filter((x) => !x.pago_em);
    return {
      projeto_id: p.id, titulo: p.titulo, cliente_id: p.cliente_id, cliente_nome: p.cliente_nome, servico: p.servico,
      etapa: p.etapa, prazo_entrega: p.prazo_entrega ?? null,
      atrasado: p.etapa !== 'entregue' && Boolean(p.prazo_entrega) && p.prazo_entrega < hoje,
      data_entrega: p.data_entrega ?? null,
      tarefas: { feitas: ts.length - abertas.length, total: ts.length, abertas },
      parcelas: {
        pagas_centavos: soma(ps.filter((x) => x.pago_em)),
        atrasadas_centavos: soma(naoPagas.filter((x) => estadoParcela(x, hoje) === 'atrasada')),
        a_vencer_centavos: soma(naoPagas.filter((x) => estadoParcela(x, hoje) !== 'atrasada')),
      },
      mensalidade: { ativa: Boolean(p.mensalidade_ativa), valor_centavos: p.mensalidade_valor_centavos ?? 0 },
      parcelasAbertas: naoPagas.length,
    };
  });

  const relevantes = fichas.filter((f) => f.etapa !== 'entregue'
    || entregueRelevante(f, { tarefasAbertas: f.tarefas.abertas.length, parcelasAbertas: f.parcelasAbertas }, hoje));
  // Tira os campos de apoio (servico e contagem interna) da ficha pública.
  const publica = ({ parcelasAbertas: _p, servico: _s, ...ficha }) => ficha;

  const servicos = SERVICOS_ORDEM.map((servico) => {
    const doServico = relevantes.filter((f) => f.servico === servico);
    return {
      servico,
      nao_entregues: doServico.filter((f) => f.etapa !== 'entregue').sort(ordenar).map(publica),
      entregues: doServico.filter((f) => f.etapa === 'entregue').map(publica),
    };
  });

  const por_etapa = {};
  for (const f of relevantes.filter((x) => x.etapa !== 'entregue')) por_etapa[f.etapa] = (por_etapa[f.etapa] ?? 0) + 1;

  return {
    gerado_em: hoje,
    pede_acao: {
      projetos_atrasados: relevantes.filter((f) => f.atrasado).map((f) => ({
        projeto_id: f.projeto_id, titulo: f.titulo, cliente_nome: f.cliente_nome, servico: f.servico, prazo_entrega: f.prazo_entrega,
      })),
      parcelas_atrasadas: {
        quantidade: atrasadas.length,
        total_centavos: soma(atrasadas),
        itens: atrasadas.map((p) => ({
          projeto_id: p.projeto_id ?? null, titulo: p.projeto_titulo, cliente_nome: p.cliente_nome,
          valor_centavos: p.valor_centavos, vencimento: p.vencimento,
        })),
      },
      sites_fora_do_ar: todas(
        `SELECT h.projeto_id, p.titulo, h.url, h.status_desde FROM hospedagens h
         JOIN projetos p ON p.id = h.projeto_id WHERE h.status = 'fora_do_ar' AND p.ficticio = 0 AND p.etapa <> 'perdido'`,
      ),
      tarefas_vencidas: tarefasLista.filter((t) => tarefaVencida(t, hoje))
        .map((t) => ({ tarefa_id: t.id, texto: t.texto, prazo: t.prazo, projeto_id: t.projeto_id, projeto_titulo: t.projeto_titulo })),
    },
    servicos,
    numeros: {
      por_etapa,
      a_receber_centavos: soma(parcelasAbertas) + soma(vendasAbertas),
      vencido_centavos: soma(atrasadas),
    },
  };
}
