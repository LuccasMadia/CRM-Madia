import { ErroHttp, ErroValidacao } from '../http/erros.js';

const TOLERANCIA_PADRAO_MS = 10 * 60 * 1000;

// Publica os agendados cujo horário chegou. Quem passou da tolerância vira 'atrasado'
// e nunca é publicado sozinho: o usuário decide a partir da tela.
export function verificarAgendados({
  db,
  agora = new Date(),
  publicador,
  toleranciaMs = TOLERANCIA_PADRAO_MS,
  log = (erro) => console.error('[agendador]', erro),
}) {
  const agoraIso = agora.toISOString();
  const vencidos = db
    // Já ligado a um post do Instagram (sync ou ligação manual): foi postado por fora, não publica de novo.
    .prepare(
      "SELECT id, agendado_para FROM conteudos WHERE estado = 'agendado' AND midia_id IS NULL AND agendado_para <= ? ORDER BY agendado_para, id",
    )
    .all(agoraIso);

  for (const { id, agendado_para: agendadoPara } of vencidos) {
    if (agora.getTime() - Date.parse(agendadoPara) > toleranciaMs) {
      db.prepare("UPDATE conteudos SET estado = 'atrasado', atualizado_em = ? WHERE id = ? AND estado = 'agendado'").run(agoraIso, id);
      continue;
    }
    try {
      publicador.iniciar(id);
    } catch (erro) {
      if (erro instanceof ErroHttp && erro.status === 409) continue;
      if (erro instanceof ErroValidacao) {
        const mensagem = erro.erros.map((e) => e.mensagem).join(' ');
        db.prepare("UPDATE conteudos SET estado = 'falhou', publicacao_erro = ?, atualizado_em = ? WHERE id = ? AND estado = 'agendado'").run(
          mensagem,
          agoraIso,
          id,
        );
        continue;
      }
      log(erro);
    }
  }
}
