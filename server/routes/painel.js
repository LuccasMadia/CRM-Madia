import { Router } from 'express';
import { linha } from '../repos/crud.js';
import { gerarTodasMensalidades } from '../repos/mensalidades.js';
import { aReceberNoMes, estadoParcela } from '../domain/financeiro.js';
import { agruparTarefasPorProjeto, montarDivulgacao } from '../domain/painel.js';
import { montarFunil, recebidoPorMes, agruparOrigens, faturamentoPorServico } from '../domain/graficos.js';
import { vendasPlacasComoParcelas, repoPlacasMontagens, repoPlacasVendas, repoPlacasModelos } from '../repos/placas.js';
import { montadasDoModelo } from '../domain/placas.js';

export function rotasPainel({ db, hoje }) {
  const r = Router();
  const todas = (sql) => db.prepare(sql).all().map(linha);

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
    const propostas = todas("SELECT valor_total_centavos FROM projetos WHERE etapa IN ('apresentado', 'valor_definido', 'teste') AND ficticio = 0 AND servico = 'site_sistema'");
    // Em andamento = protótipo + versão final: o que está nas mãos do Lucca, não do cliente.
    const emAndamento = todas(
      "SELECT id FROM projetos WHERE etapa IN ('prototipo', 'andamento') AND ficticio = 0 AND servico = 'site_sistema'",
    );

    const paraEntregar = todas(
      `SELECT p.id AS projeto_id, p.cliente_id, c.nome AS cliente_nome, p.servico
       FROM projetos p JOIN clientes c ON c.id = p.cliente_id
       WHERE p.servico <> 'site_sistema' AND p.etapa = 'andamento' AND p.ficticio = 0
       ORDER BY c.nome COLLATE NOCASE, p.id`,
    );

    res.json({
      cartoes: {
        a_receber_mes_centavos: aReceberNoMes([...parcelasAbertas, ...vendasAbertas], dia),
        atrasadas: {
          quantidade: atrasadas.length,
          total_centavos: atrasadas.reduce((s, p) => s + p.valor_centavos, 0),
        },
        em_andamento: emAndamento.length,
        propostas: {
          quantidade: propostas.length,
          total_centavos: propostas.reduce((s, p) => s + p.valor_total_centavos, 0),
        },
      },
      para_entregar: {
        gmn: paraEntregar.filter((i) => i.servico === 'google_meu_negocio').length,
        placas: vendasAbertas.length,
        itens: paraEntregar,
      },
      tarefas_por_projeto: agruparTarefasPorProjeto(
        todas(
          `SELECT t.id, t.texto, t.prazo, p.id AS projeto_id, p.titulo AS projeto_titulo, p.ficticio
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
    const pagas = todas(
      `SELECT pa.valor_centavos, pa.pago_em, p.servico FROM parcelas pa
       JOIN projetos p ON p.id = pa.projeto_id WHERE pa.pago_em IS NOT NULL AND p.ficticio = 0`,
    ).concat(vendasPlacasComoParcelas(db, dia).filter((v) => v.pago_em));
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
