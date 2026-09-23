import { Router } from 'express';
import { linha } from '../repos/crud.js';
import { aReceberNoMes, estadoParcela } from '../domain/financeiro.js';
import { montarProximos } from '../domain/painel.js';

export function rotasPainel({ db, hoje }) {
  const r = Router();
  const todas = (sql) => db.prepare(sql).all().map(linha);

  r.get('/painel', (req, res) => {
    const dia = hoje();
    const parcelasAbertas = todas(
      `SELECT pa.*, p.titulo AS projeto_titulo FROM parcelas pa
       JOIN projetos p ON p.id = pa.projeto_id WHERE pa.pago_em IS NULL`,
    );
    const atrasadas = parcelasAbertas.filter((p) => estadoParcela(p, dia) === 'atrasada');
    const propostas = todas("SELECT valor_total_centavos FROM projetos WHERE etapa = 'proposta'");
    const entregas = todas(
      `SELECT p.*, c.nome AS cliente_nome FROM projetos p JOIN clientes c ON c.id = p.cliente_id
       WHERE p.etapa = 'andamento'`,
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
      proximos: montarProximos(
        {
          tarefas: todas(
            `SELECT t.*, p.titulo AS projeto_titulo FROM tarefas t JOIN projetos p ON p.id = t.projeto_id
             WHERE t.concluida = 0 AND t.prazo IS NOT NULL AND p.etapa <> 'perdido'`,
          ),
          parcelas: parcelasAbertas,
          entregas,
          conteudos: todas("SELECT * FROM conteudos WHERE status <> 'publicado' AND data_planejada IS NOT NULL"),
        },
        dia,
      ),
    });
  });

  return r;
}
