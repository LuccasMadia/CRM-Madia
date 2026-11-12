import { linha } from '../repos/crud.js';
import { estadoParcela } from '../domain/financeiro.js';
import { vendasPlacasComoParcelas } from '../repos/placas.js';
import { tarefaVencida, entregueRelevante } from '../domain/cerebro.js';

const COMERCIAL = ['ideia', 'apresentado', 'valor_definido', 'teste'];
const ROTULO_ETAPA = {
  ideia: 'Ideia', prototipo: 'Protótipo', apresentado: 'Apresentado', valor_definido: 'Valor definido',
  teste: 'Em teste', andamento: 'Em andamento', entregue: 'Entregue',
};
const brl = (c) => `R$ ${(c / 100).toFixed(2).replace('.', ',')}`;
const dataBr = (d) => d.split('-').reverse().join('/');

// Chame gerarTodasMensalidades(db, hoje) antes, para as parcelas de mensalidade estarem em dia.
export function montarMemoria(db, hoje) {
  const todas = (sql) => db.prepare(sql).all().map(linha);
  const vivo = "p.ficticio = 0 AND p.etapa <> 'perdido'";

  const projetos = todas(
    `SELECT p.*, c.nome AS cliente_nome FROM projetos p JOIN clientes c ON c.id = p.cliente_id WHERE ${vivo} ORDER BY p.id`,
  );
  const tarefas = todas(
    `SELECT t.* FROM tarefas t LEFT JOIN projetos p ON p.id = t.projeto_id
     WHERE t.concluida = 0 AND (t.projeto_id IS NULL OR (${vivo})) ORDER BY t.ordem, t.id`,
  );
  const parcelas = todas(
    `SELECT pa.*, p.titulo AS projeto_titulo FROM parcelas pa JOIN projetos p ON p.id = pa.projeto_id
     WHERE pa.pago_em IS NULL AND ${vivo} ORDER BY pa.vencimento, pa.id`,
  );
  const contarPorProjeto = (lista) => lista.reduce((m, x) => m.set(x.projeto_id, (m.get(x.projeto_id) ?? 0) + 1), new Map());
  const tarefasAbertas = contarPorProjeto(tarefas);
  const parcelasAbertas = contarPorProjeto(parcelas);

  const pontoProjeto = (p) => ({
    id: `projeto:${p.id}`,
    rotulo: p.titulo,
    destaque: p.etapa !== 'entregue' && Boolean(p.prazo_entrega) && p.prazo_entrega < hoje,
    link: `/projetos/${p.id}`,
    resumo: `${p.cliente_nome} · ${ROTULO_ETAPA[p.etapa] ?? p.etapa}${p.prazo_entrega ? ` · prazo ${dataBr(p.prazo_entrega)}` : ''}`,
  });

  const clientes = todas('SELECT id, nome, responsavel FROM clientes ORDER BY nome, id').map((c) => ({
    id: `cliente:${c.id}`, rotulo: c.nome, destaque: false, link: `/clientes/${c.id}`, resumo: c.responsavel || 'Cliente',
  }));

  const orcamentos = todas(
    'SELECT o.id, o.situacao, o.data, c.nome AS cliente_nome FROM orcamentos o JOIN clientes c ON c.id = o.cliente_id ORDER BY o.id',
  ).map((o) => ({
    id: `orcamento:${o.id}`, rotulo: `Orçamento ${o.id} · ${o.cliente_nome}`, destaque: false,
    link: `/orcamentos/${o.id}`, resumo: `Orçamento ${o.situacao} em ${dataBr(o.data)}`,
  }));

  const comercial = [...projetos.filter((p) => COMERCIAL.includes(p.etapa)).map(pontoProjeto), ...orcamentos];
  const emProjetos = projetos
    .filter((p) => p.etapa === 'prototipo' || p.etapa === 'andamento'
      || (p.etapa === 'entregue'
        && entregueRelevante(p, { tarefasAbertas: tarefasAbertas.get(p.id) ?? 0, parcelasAbertas: parcelasAbertas.get(p.id) ?? 0 }, hoje)))
    .map(pontoProjeto);

  const processos = tarefas.map((t) => ({
    id: `tarefa:${t.id}`, rotulo: t.texto, destaque: tarefaVencida(t, hoje),
    link: t.projeto_id ? `/projetos/${t.projeto_id}` : '/tarefas',
    resumo: t.prazo ? `Tarefa com prazo ${dataBr(t.prazo)}` : 'Tarefa sem prazo',
  }));

  const dePlacas = vendasPlacasComoParcelas(db, hoje).filter((v) => !v.pago_em).map((v) => ({
    id: `venda:${v.id}`, rotulo: `${v.cliente_nome ?? 'Venda'} · ${v.projeto_titulo}`, destaque: v.estado === 'atrasada',
    link: '/financeiro', resumo: `${brl(v.valor_centavos)} da venda de placas, vencimento ${dataBr(v.vencimento)}`,
  }));
  const administrativo = [
    ...parcelas.map((pa) => ({
      id: `parcela:${pa.id}`, rotulo: pa.projeto_titulo, destaque: estadoParcela(pa, hoje) === 'atrasada',
      link: `/projetos/${pa.projeto_id}`, resumo: `${brl(pa.valor_centavos)} a receber, vencimento ${dataBr(pa.vencimento)}`,
    })),
    ...dePlacas,
    ...todas(
      `SELECT h.projeto_id, h.url, h.status, p.titulo FROM hospedagens h JOIN projetos p ON p.id = h.projeto_id
       WHERE h.tipo = 'vercel' AND ${vivo} ORDER BY h.projeto_id`,
    ).map((h) => ({
      id: `hospedagem:${h.projeto_id}`, rotulo: `Site ${h.titulo}`, destaque: h.status === 'fora_do_ar',
      link: `/projetos/${h.projeto_id}`, resumo: `Hospedagem ${h.status.replace(/_/g, ' ')}${h.url ? ` · ${h.url}` : ''}`,
    })),
    ...todas('SELECT * FROM ferramentas WHERE cancelada_em IS NULL ORDER BY id').map((f) => ({
      id: `ferramenta:${f.id}`, rotulo: f.nome, destaque: false, link: '/financeiro',
      resumo: f.cobranca === 'mensalidade' && f.valor_centavos ? `Mensalidade de ${brl(f.valor_centavos)}` : 'Créditos por recarga',
    })),
  ];

  const conteudo = todas('SELECT id, titulo, tipo, estado FROM conteudos ORDER BY id').map((c) => ({
    id: `conteudo:${c.id}`, rotulo: c.titulo, destaque: false, link: '/conteudo', resumo: `${c.tipo} · ${c.estado}`,
  }));

  const area = (id, rotulo, pontos) => ({ id, rotulo, pontos });
  return {
    areas: [
      area('clientes', 'Clientes', clientes),
      area('comercial', 'Comercial', comercial),
      area('projetos', 'Projetos', emProjetos),
      area('processos', 'Processos', processos),
      area('administrativo', 'Administrativo', administrativo),
      area('conteudo', 'Conteúdo', conteudo),
    ],
  };
}
