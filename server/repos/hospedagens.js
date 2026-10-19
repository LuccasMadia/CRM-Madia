import { linha, emTransacao } from './crud.js';

const agora = () => new Date().toISOString();

const CAMPOS_STATUS = ['status', 'status_desde', 'falhas_seguidas', 'ultimo_motivo', 'ultima_checagem', 'cliente_avisado_em'];

export function repoHospedagens(db) {
  const obter = (projetoId) => linha(db.prepare('SELECT * FROM hospedagens WHERE projeto_id = ?').get(projetoId));

  // Upsert. Trocar `url` ou `tipo` zera o monitoramento, exceto num site pausado (continua pausado).
  function salvarCadastro(projetoId, { tipo, url, vercel_projeto_id, vercel_projeto_nome }) {
    const dados = [tipo, url ?? null, vercel_projeto_id ?? null, vercel_projeto_nome ?? null];
    emTransacao(db, () => {
      const atual = obter(projetoId);
      if (!atual) {
        db.prepare(
          'INSERT INTO hospedagens (projeto_id, tipo, url, vercel_projeto_id, vercel_projeto_nome, atualizado_em) VALUES (?, ?, ?, ?, ?, ?)',
        ).run(projetoId, ...dados, agora());
        return;
      }
      const mudou = atual.tipo !== tipo || atual.url !== (url ?? null);
      const zerar = mudou && atual.status !== 'pausado';
      db.prepare(
        `UPDATE hospedagens SET tipo = ?, url = ?, vercel_projeto_id = ?, vercel_projeto_nome = ?, atualizado_em = ?${
          zerar
            ? ", status = 'desconhecido', status_desde = NULL, falhas_seguidas = 0, ultimo_motivo = NULL, ultima_checagem = NULL"
            : ''
        } WHERE projeto_id = ?`,
      ).run(...dados, agora(), projetoId);
    });
    return obter(projetoId);
  }

  // Aceita qualquer subconjunto dos campos de status; ignora o resto.
  function atualizar(projetoId, campos) {
    const colunas = CAMPOS_STATUS.filter((c) => c in campos);
    db.prepare(`UPDATE hospedagens SET ${[...colunas, 'atualizado_em'].map((c) => `${c} = ?`).join(', ')} WHERE projeto_id = ?`).run(
      ...colunas.map((c) => campos[c]),
      agora(),
      projetoId,
    );
    return obter(projetoId);
  }

  const listarMonitorados = () =>
    db
      .prepare("SELECT * FROM hospedagens WHERE tipo = 'vercel' AND url IS NOT NULL AND status <> 'pausado' ORDER BY projeto_id")
      .all()
      .map(linha);

  const listarTodas = () => db.prepare('SELECT * FROM hospedagens ORDER BY projeto_id').all().map(linha);

  function registrarPausa(projetoId, acao, em) {
    db.prepare('INSERT INTO hospedagem_pausas (projeto_id, acao, em) VALUES (?, ?, ?)').run(projetoId, acao, em);
  }

  const listarPausas = (projetoId) =>
    db
      .prepare('SELECT acao, em FROM hospedagem_pausas WHERE projeto_id = ? ORDER BY id DESC')
      .all(projetoId)
      .map(linha);

  return { obter, salvarCadastro, atualizar, listarMonitorados, listarTodas, registrarPausa, listarPausas };
}
