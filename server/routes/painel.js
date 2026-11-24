import { Router } from 'express';
import { linha } from '../repos/crud.js';
import { gerarTodasMensalidades } from '../repos/mensalidades.js';
import { aReceberNoMes, estadoParcela } from '../domain/financeiro.js';
import { agruparTarefasPorProjeto, montarDivulgacao } from '../domain/painel.js';
import { montarFunil, recebidoPorMes, agruparOrigens, faturamentoPorServico } from '../domain/graficos.js';
import { vendasPlacasComoParcelas, repoPlacasMontagens, repoPlacasVendas, repoPlacasModelos } from '../repos/placas.js';
import { montadasDoModelo } from '../domain/placas.js';
import { montarRelatorioProjetos } from '../cerebro/relatorio.js';
import { pedeAtencao } from '../cerebro/pedeAtencao.js';
import { alertasOrcamento, diasEntre } from '../domain/orcamentos.js';
import { tarefaVencida } from '../domain/cerebro.js';
import { dataValida } from '../domain/datas.js';

const MAX_TAREFAS = 15;
const DIAS_PROJETO_PARADO = 14;

// Mesmo filtro do relatório do cérebro: tarefa solta ou de projeto real e não perdido.
const TAREFAS_ABERTAS_SQL = `FROM tarefas t LEFT JOIN projetos p ON p.id = t.projeto_id LEFT JOIN clientes c ON c.id = t.cliente_id
  WHERE t.concluida = 0 AND (t.projeto_id IS NULL OR (p.ficticio = 0 AND p.etapa <> 'perdido'))`;

// Vencidas (mais atrasada primeiro), depois com prazo válido por prazo, depois o resto da mais nova.
function ordemTarefa(a, b) {
  const grupo = (t) => (t.dias_atraso > 0 ? 0 : dataValida(t.prazo) ? 1 : 2);
  return grupo(a) - grupo(b)
    || (grupo(a) === 0 ? b.dias_atraso - a.dias_atraso : 0)
    || (grupo(a) === 1 ? a.prazo.localeCompare(b.prazo) : 0)
    || (grupo(a) === 2 ? b.criado_em.localeCompare(a.criado_em) : 0)
    || a.id - b.id;
}

export function rotasPainel({ db, hoje }) {
  const r = Router();
  const todas = (sql) => db.prepare(sql).all().map(linha);
  const parcelasPagas = (dia) => todas(
    `SELECT pa.valor_centavos, pa.pago_em, p.servico FROM parcelas pa
     JOIN projetos p ON p.id = pa.projeto_id WHERE pa.pago_em IS NOT NULL AND p.ficticio = 0`,
  ).concat(vendasPlacasComoParcelas(db, dia).filter((v) => v.pago_em));

  r.get('/painel', (req, res) => {
    gerarTodasMensalidades(db, hoje());
    const dia = hoje();
    const parcelasAbertas = todas(
      `SELECT pa.*, p.titulo AS projeto_titulo, p.servico, p.cliente_id FROM parcelas pa
       JOIN projetos p ON p.id = pa.projeto_id WHERE pa.pago_em IS NULL AND p.ficticio = 0`,
    );
    const vendasAbertas = vendasPlacasComoParcelas(db, dia).filter((v) => !v.pago_em);
    const atrasadas = [
      ...parcelasAbertas.filter((p) => estadoParcela(p, dia) === 'atrasada'),
      ...vendasAbertas.filter((v) => v.estado === 'atrasada'),
    ];
    const propostas = todas("SELECT valor_total_centavos FROM projetos WHERE etapa IN ('apresentado', 'valor_definido') AND ficticio = 0 AND servico = 'site_sistema'");
    // Em andamento = protótipo + versão final: o que está nas mãos do Lucca, não do cliente.
    const emAndamento = todas(
      "SELECT id, etapa FROM projetos WHERE etapa IN ('prototipo', 'andamento') AND ficticio = 0 AND servico = 'site_sistema'",
    );

    const paraEntregar = todas(
      `SELECT p.id AS projeto_id, p.cliente_id, c.nome AS cliente_nome, p.servico
       FROM projetos p JOIN clientes c ON c.id = p.cliente_id
       WHERE p.servico <> 'site_sistema' AND p.etapa = 'andamento' AND p.ficticio = 0
       ORDER BY c.nome COLLATE NOCASE, p.id`,
    );

    const abertas = todas(
      `SELECT t.id, t.texto, t.prazo, t.etapa, t.criado_em, t.projeto_id, p.titulo AS projeto_titulo, t.cliente_id, c.nome AS cliente_nome ${TAREFAS_ABERTAS_SQL}`,
    ).map((t) => ({
      ...t,
      dias_atraso: tarefaVencida({ ...t, concluida: 0 }, dia) ? diasEntre(t.prazo, dia) : 0,
      link: t.projeto_id ? `/projetos/${t.projeto_id}` : t.cliente_id ? `/clientes/${t.cliente_id}` : '/tarefas',
    })).sort(ordemTarefa);

    const aguardando = new Map();
    for (const t of abertas.filter((x) => x.etapa === 'aguardando_cliente')) {
      const g = aguardando.get(t.cliente_id) ?? {
        cliente_id: t.cliente_id,
        cliente_nome: t.cliente_nome ?? 'Sem cliente',
        quantidade: 0,
        link: t.cliente_id ? `/clientes/${t.cliente_id}` : '/tarefas',
      };
      g.quantidade += 1;
      aguardando.set(t.cliente_id, g);
    }

    res.json({
      tarefas_abertas: {
        total: abertas.length,
        itens: abertas.slice(0, MAX_TAREFAS).map(({ criado_em: _c, ...t }) => t),
      },
      follow_ups: {
        orcamentos: todas(
          `SELECT o.id, o.data, o.validade_dias, o.situacao, c.nome AS cliente_nome
           FROM orcamentos o JOIN clientes c ON c.id = o.cliente_id WHERE o.situacao = 'enviado' ORDER BY o.data, o.id`,
        ).filter((o) => alertasOrcamento(o, dia).sem_resposta)
          .map((o) => ({ id: o.id, cliente_nome: o.cliente_nome, dias: diasEntre(o.data, dia), link: `/orcamentos/${o.id}` })),
        projetos: todas(
          `SELECT p.id, p.titulo, c.nome AS cliente_nome, substr(p.atualizado_em, 1, 10) AS desde
           FROM projetos p JOIN clientes c ON c.id = p.cliente_id
           WHERE p.servico = 'site_sistema' AND p.ficticio = 0 AND p.etapa IN ('prototipo', 'apresentado', 'valor_definido', 'teste', 'andamento')
           ORDER BY desde, p.id`,
        ).map((p) => ({ id: p.id, titulo: p.titulo, cliente_nome: p.cliente_nome, dias: diasEntre(p.desde, dia), link: `/projetos/${p.id}` }))
          .filter((p) => p.dias > DIAS_PROJETO_PARADO),
        aguardando: [...aguardando.values()].sort((a, b) => b.quantidade - a.quantidade || a.cliente_nome.localeCompare(b.cliente_nome)),
      },
      cartoes: {
        a_receber_mes_centavos: aReceberNoMes([...parcelasAbertas, ...vendasAbertas], dia),
        atrasadas: {
          quantidade: atrasadas.length,
          total_centavos: atrasadas.reduce((s, p) => s + p.valor_centavos, 0),
        },
        recebido_mes_centavos: parcelasPagas(dia)
          .filter((p) => p.pago_em.slice(0, 7) === dia.slice(0, 7))
          .reduce((s, p) => s + p.valor_centavos, 0),
        em_andamento: emAndamento.length,
        em_andamento_detalhe: {
          prototipo: emAndamento.filter((p) => p.etapa === 'prototipo').length,
          andamento: emAndamento.filter((p) => p.etapa === 'andamento').length,
        },
        propostas: {
          quantidade: propostas.length,
          total_centavos: propostas.reduce((s, p) => s + p.valor_total_centavos, 0),
        },
      },
      pede_atencao: pedeAtencao(montarRelatorioProjetos(db, dia).pede_acao),
      para_entregar: {
        gmn: paraEntregar.filter((i) => i.servico === 'google_meu_negocio').length,
        placas: vendasAbertas.length,
        itens: paraEntregar,
      },
      tarefas_por_projeto: agruparTarefasPorProjeto(
        todas(
          `SELECT t.id, t.texto, t.prazo, t.etapa, p.id AS projeto_id, p.titulo AS projeto_titulo, p.ficticio
           FROM tarefas t JOIN projetos p ON p.id = t.projeto_id
           WHERE t.concluida = 0 AND p.etapa <> 'perdido'
           ORDER BY p.prazo_entrega IS NULL, p.prazo_entrega, p.id, t.ordem, t.id`,
        ),
      ),
      divulgacao: montarDivulgacao(
        todas(
          `SELECT p.id, p.titulo, p.ficticio, p.postou_instagram, COALESCE(pf.publicar, 0) AS portfolio_publicado
           FROM projetos p LEFT JOIN portfolio pf ON pf.projeto_id = p.id
           WHERE p.etapa = 'entregue' AND p.servico = 'site_sistema' AND (p.postou_instagram = 0 OR COALESCE(pf.publicar, 0) = 0)
           ORDER BY p.ficticio, p.titulo`,
        ),
      ),
    });
  });

  r.get('/painel/graficos', (req, res) => {
    gerarTodasMensalidades(db, hoje());
    const dia = hoje();
    const pagas = parcelasPagas(dia);
    res.json({
      funil: montarFunil(todas('SELECT etapa, servico FROM projetos WHERE ficticio = 0')),
      recebido_por_mes: recebidoPorMes(pagas, dia),
      origens: agruparOrigens(todas('SELECT origem FROM clientes')),
      por_servico: faturamentoPorServico(pagas, dia),
    });
  });

  r.get('/servicos/resumo', (req, res) => {
    gerarTodasMensalidades(db, hoje());
    const abertas = todas(
      `SELECT pa.valor_centavos, p.servico FROM parcelas pa
       JOIN projetos p ON p.id = pa.projeto_id WHERE pa.pago_em IS NULL AND p.ficticio = 0`,
    ).concat(vendasPlacasComoParcelas(db, hoje()).filter((v) => !v.pago_em));
    const aReceber = (servico) => abertas.filter((p) => p.servico === servico).reduce((s, p) => s + p.valor_centavos, 0);
    const montagens = repoPlacasMontagens(db).listar();
    const vendas = repoPlacasVendas(db).listar();
    const montadas = repoPlacasModelos(db).listar().reduce((s, m) => s + Math.max(0, montadasDoModelo(m.id, montagens, vendas)), 0);
    res.json({
      site_sistema: { a_receber_centavos: aReceber('site_sistema') },
      google_meu_negocio: { a_receber_centavos: aReceber('google_meu_negocio') },
      placas_nfc: {
        a_receber_centavos: aReceber('placas_nfc'),
        vendas_a_receber: abertas.filter((p) => p.servico === 'placas_nfc').length,
        montadas,
      },
    });
  });

  return r;
}
