import { Router } from 'express';
import { linha } from '../repos/crud.js';
import { aReceberNoMes, estadoParcela } from '../domain/financeiro.js';
import { montarProximos, agruparTarefasPorProjeto, montarDivulgacaoPendente } from '../domain/painel.js';

export function rotasPainel({ db, hoje }) {
  const r = Router();
  const todas = (sql) => db.prepare(sql).all().map(linha);

  r.get('/painel', (req, res) => {
    const dia = hoje();
    const parcelasAbertas = todas(
      `SELECT pa.*, p.titulo AS projeto_titulo FROM parcelas pa
       JOIN projetos p ON p.id = pa.projeto_id WHERE pa.pago_em IS NULL AND p.ficticio = 0`,
    );
    const atrasadas = parcelasAbertas.filter((p) => estadoParcela(p, dia) === 'atrasada');
    const propostas = todas("SELECT valor_total_centavos FROM projetos WHERE etapa = 'proposta' AND ficticio = 0");
    const entregas = todas(
      `SELECT p.*, c.nome AS cliente_nome FROM projetos p JOIN clientes c ON c.id = p.cliente_id
       WHERE p.etapa = 'andamento' AND p.ficticio = 0`,
    );

    res.json({
      cartoes: {
        a_receber_mes_centavos: aReceberNoMes(parcelasAbertas, dia),
        atrasadas: {
          quantidade: atrasadas.length,
          total_centavos: atrasadas.reduce((s, p) => s + p.valor_centavos, 0),
        },
        em_andamento: entregas.length,
        propostas: {
          quantidade: propostas.length,
          total_centavos: propostas.reduce((s, p) => s + p.valor_total_centavos, 0),
        },
      },
      tarefas_por_projeto: agruparTarefasPorProjeto(
        todas(
          `SELECT t.id, t.texto, t.prazo, p.id AS projeto_id, p.titulo AS projeto_titulo, p.ficticio
           FROM tarefas t JOIN projetos p ON p.id = t.projeto_id
           WHERE t.concluida = 0 AND p.etapa <> 'perdido'
           ORDER BY p.prazo_entrega IS NULL, p.prazo_entrega, p.id, t.ordem, t.id`,
        ),
      ),
      divulgacao_pendente: montarDivulgacaoPendente(
        todas(
          `SELECT p.id, p.titulo, p.ficticio, p.postou_instagram, COALESCE(pf.publicar, 0) AS portfolio_publicado
           FROM projetos p LEFT JOIN portfolio pf ON pf.projeto_id = p.id
           WHERE p.etapa = 'entregue' AND (p.postou_instagram = 0 OR COALESCE(pf.publicar, 0) = 0)
           ORDER BY p.titulo`,
        ),
      ),
      proximos: montarProximos(
        {
          parcelas: parcelasAbertas,
          entregas,
          conteudos: todas(
            `SELECT c.* FROM conteudos c LEFT JOIN projetos p ON p.id = c.projeto_id
             WHERE c.status <> 'publicado' AND c.data_planejada IS NOT NULL AND (p.id IS NULL OR p.ficticio = 0)`,
          ),
        },
        dia,
      ),
    });
  });

  return r;
}
