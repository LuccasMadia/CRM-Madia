import { linha } from '../repos/crud.js';
import { estadoParcela } from '../domain/financeiro.js';
import { vendasPlacasComoParcelas } from '../repos/placas.js';
import { tarefaVencida, entregueRelevante } from '../domain/cerebro.js';

const COMERCIAL = ['ideia', 'apresentado', 'valor_definido'];
const ROTULO_ETAPA = {
  ideia: 'Ideia', prototipo: 'Protótipo', apresentado: 'Apresentado', valor_definido: 'Orçamento enviado',
  teste: 'Em teste', andamento: 'Em andamento', entregue: 'Entregue',
};
const brl = (c) => `R$ ${(c / 100).toFixed(2).replace('.', ',')}`;
const dataBr = (d) => d.split('-').reverse().join('/');

// Chame gerarTodasMensalidades(db, hoje) antes, para as parcelas de mensalidade estarem em dia.
export function montarMemoria(db, hoje) {
  const todas = (sql) => db.prepare(sql).all().map(linha);
  const vivo = "p.ficticio = 0 AND p.etapa <> 'perdido'";

  // Todo ponto sai com tipo, vivo e texto. Histórico (vivoAgora = false) nunca é destaque.
  const ponto = (tipo, vivoAgora, o) => ({ ...o, tipo, vivo: vivoAgora, destaque: vivoAgora && o.destaque, texto: null });

  const projetos = todas(
    `SELECT p.*, c.nome AS cliente_nome FROM projetos p JOIN clientes c ON c.id = p.cliente_id WHERE ${vivo} ORDER BY p.id`,
  );
  const perdidos = todas(
    `SELECT p.*, c.nome AS cliente_nome FROM projetos p JOIN clientes c ON c.id = p.cliente_id
     WHERE p.ficticio = 0 AND p.etapa = 'perdido' ORDER BY p.id`,
  );
  const tarefas = todas(
    `SELECT t.* FROM tarefas t LEFT JOIN projetos p ON p.id = t.projeto_id
     WHERE t.concluida = 0 AND (t.projeto_id IS NULL OR (${vivo})) ORDER BY t.ordem, t.id`,
  );
  const tarefasFeitas = todas(
    `SELECT t.* FROM tarefas t LEFT JOIN projetos p ON p.id = t.projeto_id
     WHERE t.concluida = 1 AND (t.projeto_id IS NULL OR p.ficticio = 0) ORDER BY t.ordem, t.id`,
  );
  const parcelas = todas(
    `SELECT pa.*, p.titulo AS projeto_titulo FROM parcelas pa JOIN projetos p ON p.id = pa.projeto_id
     WHERE pa.pago_em IS NULL AND p.ficticio = 0 ORDER BY pa.vencimento, pa.id`,
  );
  const parcelasPagas = todas(
    `SELECT pa.*, p.titulo AS projeto_titulo FROM parcelas pa JOIN projetos p ON p.id = pa.projeto_id
     WHERE pa.pago_em IS NOT NULL AND p.ficticio = 0 ORDER BY pa.vencimento, pa.id`,
  );
  const contarPorProjeto = (lista) => lista.reduce((m, x) => m.set(x.projeto_id, (m.get(x.projeto_id) ?? 0) + 1), new Map());
  const tarefasAbertas = contarPorProjeto(tarefas);
  const parcelasAbertas = contarPorProjeto(parcelas);

  const pontoProjeto = (p, vivoAgora = true) => ponto('projeto', vivoAgora, {
    id: `projeto:${p.id}`,
    rotulo: p.titulo,
    destaque: p.etapa !== 'entregue' && Boolean(p.prazo_entrega) && p.prazo_entrega < hoje,
    link: `/projetos/${p.id}`,
    ligacoes: [`cliente:${p.cliente_id}`],
    resumo: `${p.cliente_nome} · ${ROTULO_ETAPA[p.etapa] ?? p.etapa}${p.prazo_entrega ? ` · prazo ${dataBr(p.prazo_entrega)}` : ''}`,
  });

  const clientes = todas('SELECT id, nome, responsavel FROM clientes ORDER BY nome, id').map((c) => ponto('cliente', true, {
    id: `cliente:${c.id}`, rotulo: c.nome, destaque: false, link: `/clientes/${c.id}`, ligacoes: [], resumo: c.responsavel || 'Cliente',
  }));

  const orcamentos = todas(
    'SELECT o.id, o.cliente_id, o.situacao, o.data, c.nome AS cliente_nome FROM orcamentos o JOIN clientes c ON c.id = o.cliente_id ORDER BY o.id',
  ).map((o) => ponto('orcamento', true, {
    id: `orcamento:${o.id}`, rotulo: `Orçamento ${o.id} · ${o.cliente_nome}`, destaque: false,
    link: `/orcamentos/${o.id}`, ligacoes: [`cliente:${o.cliente_id}`], resumo: `Orçamento ${o.situacao} em ${dataBr(o.data)}`,
  }));

  const entregueVivo = (p) => entregueRelevante(
    p, { tarefasAbertas: tarefasAbertas.get(p.id) ?? 0, parcelasAbertas: parcelasAbertas.get(p.id) ?? 0 }, hoje,
  );
  const comercial = [
    ...projetos.filter((p) => COMERCIAL.includes(p.etapa)).map((p) => pontoProjeto(p)),
    ...orcamentos,
    ...perdidos.map((p) => pontoProjeto(p, false)),
  ];
  const emProjetos = [
    ...projetos
      .filter((p) => p.etapa === 'prototipo' || p.etapa === 'andamento' || p.etapa === 'teste' || (p.etapa === 'entregue' && entregueVivo(p)))
      .map((p) => pontoProjeto(p)),
    ...projetos.filter((p) => p.etapa === 'entregue' && !entregueVivo(p)).map((p) => pontoProjeto(p, false)),
  ];

  const pontoTarefa = (t, vivoAgora) => ponto('tarefa', vivoAgora, {
    id: `tarefa:${t.id}`, rotulo: t.texto, destaque: tarefaVencida(t, hoje),
    link: t.projeto_id ? `/projetos/${t.projeto_id}` : '/tarefas',
    ligacoes: t.projeto_id ? [`projeto:${t.projeto_id}`] : t.cliente_id ? [`cliente:${t.cliente_id}`] : [],
    resumo: t.prazo ? `Tarefa com prazo ${dataBr(t.prazo)}` : 'Tarefa sem prazo',
  });
  const processos = [...tarefas.map((t) => pontoTarefa(t, true)), ...tarefasFeitas.map((t) => pontoTarefa(t, false))];

  const pontoParcela = (pa, vivoAgora) => ponto('parcela', vivoAgora, {
    id: `parcela:${pa.id}`, rotulo: pa.projeto_titulo, destaque: estadoParcela(pa, hoje) === 'atrasada',
    link: `/projetos/${pa.projeto_id}`, ligacoes: [`projeto:${pa.projeto_id}`], resumo: `${brl(pa.valor_centavos)} a receber, vencimento ${dataBr(pa.vencimento)}`,
  });
  const pontoVenda = (v, vivoAgora) => ponto('venda', vivoAgora, {
    id: `venda:${v.id}`, rotulo: `${v.cliente_nome ?? 'Venda'} · ${v.projeto_titulo}`, destaque: v.estado === 'atrasada',
    link: '/financeiro', ligacoes: v.cliente_id ? [`cliente:${v.cliente_id}`] : [], resumo: `${brl(v.valor_centavos)} da venda de placas, vencimento ${dataBr(v.vencimento)}`,
  });
  const pontoFerramenta = (f, vivoAgora) => ponto('ferramenta', vivoAgora, {
    id: `ferramenta:${f.id}`, rotulo: f.nome, destaque: false, link: '/financeiro', ligacoes: [],
    resumo: f.cobranca === 'mensalidade' && f.valor_centavos ? `Mensalidade de ${brl(f.valor_centavos)}` : 'Créditos por recarga',
  });
  const vendas = vendasPlacasComoParcelas(db, hoje);
  const administrativo = [
    ...parcelas.map((pa) => pontoParcela(pa, true)),
    ...vendas.filter((v) => !v.pago_em).map((v) => pontoVenda(v, true)),
    ...todas(
      `SELECT h.projeto_id, h.tipo, h.url, h.status, p.titulo FROM hospedagens h JOIN projetos p ON p.id = h.projeto_id
       WHERE ${vivo} ORDER BY h.projeto_id`,
    ).map((h) => ponto('hospedagem', true, {
      id: `hospedagem:${h.projeto_id}`, rotulo: `Site ${h.titulo}`, destaque: h.status === 'fora_do_ar',
      link: `/projetos/${h.projeto_id}`,
      ligacoes: [`projeto:${h.projeto_id}`, ...(h.tipo === 'vercel' ? ['app:vercel'] : [])],
      resumo: `Hospedagem ${h.status.replace(/_/g, ' ')}${h.url ? ` · ${h.url}` : ''}`,
    })),
    ...todas('SELECT * FROM ferramentas WHERE cancelada_em IS NULL ORDER BY id').map((f) => pontoFerramenta(f, true)),
    ...parcelasPagas.map((pa) => pontoParcela(pa, false)),
    ...vendas.filter((v) => v.pago_em).map((v) => pontoVenda(v, false)),
    ...todas('SELECT * FROM ferramentas WHERE cancelada_em IS NOT NULL ORDER BY id').map((f) => pontoFerramenta(f, false)),
  ];

  const conteudo = [
    ...todas('SELECT id, titulo, tipo, estado, projeto_id FROM conteudos ORDER BY id').map((c) => ponto('conteudo', true, {
      id: `conteudo:${c.id}`, rotulo: c.titulo, destaque: false, link: '/conteudo',
      ligacoes: c.projeto_id ? ['app:instagram', `projeto:${c.projeto_id}`] : ['app:instagram'], resumo: `${c.tipo} · ${c.estado}`,
    })),
    ...todas(
      `SELECT m.id, m.tipo, m.legenda, m.publicado_em, m.projeto_id FROM instagram_midias m
       WHERE m.removido = 0 AND NOT EXISTS (SELECT 1 FROM conteudos c WHERE c.midia_id = m.id) ORDER BY m.publicado_em, m.id`,
    ).map((m) => ponto('instagram', false, {
      id: `instagram:${m.id}`, rotulo: m.legenda ? Array.from(m.legenda).slice(0, 40).join('') : 'Post do Instagram', destaque: false, link: '/conteudo',
      ligacoes: m.projeto_id ? ['app:instagram', `projeto:${m.projeto_id}`] : ['app:instagram'],
      resumo: `${m.tipo} publicado em ${dataBr(m.publicado_em.slice(0, 10))}`,
    })),
  ];

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
