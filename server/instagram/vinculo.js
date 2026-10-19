import { ErroValidacao } from '../http/erros.js';
import { emTransacao, linha } from '../repos/crud.js';
import { hojeLocal } from '../domain/datas.js';
import { normalizarLegenda } from './legenda.js';

// Planejados que ainda não viraram post e já existiam quando a mídia saiu.
const livresAntesDe = (db, publicadoEm) =>
  db.prepare('SELECT * FROM conteudos WHERE midia_id IS NULL AND criado_em < ?').all(publicadoEm).map(linha);

export function vincular(db, conteudoId, midiaId) {
  const ocupado = db.prepare('SELECT id FROM conteudos WHERE midia_id = ? AND id <> ?').get(midiaId, conteudoId);
  if (ocupado) throw new ErroValidacao([{ campo: 'conteudo_id', mensagem: 'Este post já está ligado a outro planejado' }]);
  const conteudo = db.prepare('SELECT projeto_id, midia_id, estado FROM conteudos WHERE id = ?').get(conteudoId);
  if (!conteudo) throw new ErroValidacao([{ campo: 'conteudo_id', mensagem: 'Planejado não encontrado' }]);
  if (conteudo.midia_id && conteudo.midia_id !== midiaId) {
    throw new ErroValidacao([{ campo: 'conteudo_id', mensagem: 'Este planejado já está ligado a outro post' }]);
  }
  emTransacao(db, () => {
    db.prepare('UPDATE conteudos SET midia_id = ? WHERE id = ?').run(midiaId, conteudoId);
    // Agendado/atrasado que aparece no Instagram foi postado à mão: sai da fila do agendador.
    if (conteudo.estado === 'agendado' || conteudo.estado === 'atrasado') {
      db.prepare("UPDATE conteudos SET estado = 'publicado', agendado_para = NULL WHERE id = ?").run(conteudoId);
    }
    if (conteudo.projeto_id != null) {
      db.prepare('UPDATE instagram_midias SET projeto_id = ? WHERE id = ?').run(conteudo.projeto_id, midiaId);
      db.prepare('UPDATE projetos SET postou_instagram = 1 WHERE id = ?').run(conteudo.projeto_id);
    }
  });
}

export function desvincular(db, midiaId) {
  const conteudo = db.prepare('SELECT id, projeto_id FROM conteudos WHERE midia_id = ?').get(midiaId);
  if (!conteudo) return;
  emTransacao(db, () => {
    db.prepare('UPDATE conteudos SET midia_id = NULL WHERE id = ?').run(conteudo.id);
    db.prepare('UPDATE instagram_midias SET projeto_id = NULL WHERE id = ? AND projeto_id = ?').run(midiaId, conteudo.projeto_id);
  });
}

export function vincularAutomatico(db, midia) {
  const alvo = normalizarLegenda(midia.legenda);
  if (!alvo) return false;
  const candidatos = livresAntesDe(db, midia.publicado_em).filter((c) => normalizarLegenda(c.legenda) === alvo);
  if (candidatos.length !== 1) return false;
  vincular(db, candidatos[0].id, midia.id);
  return true;
}

export function candidatosManuais(db, midia) {
  const peso = (c) => (c.estado === 'pronto' ? 0 : 1);
  return livresAntesDe(db, midia.publicado_em).sort((a, b) => peso(a) - peso(b) || a.ordem - b.ordem || a.id - b.id);
}

// Par do legado: post do mesmo tipo no mesmo dia; se a data não bater (foi
// marcado como publicado depois), o post com a mesma legenda.
// data_publicada antiga foi registrada no dia local; compara no mesmo fuso.
function paresDoLegado(legado, midias) {
  const doTipo = midias.filter((m) => m.tipo === legado.tipo);
  const doDia = doTipo.filter((m) => hojeLocal(new Date(m.publicado_em)) === legado.data_publicada);
  if (doDia.length === 1) return doDia;
  const alvo = normalizarLegenda(legado.legenda);
  return alvo ? doTipo.filter((m) => normalizarLegenda(m.legenda) === alvo) : [];
}

export function migrarLegado(db) {
  const legados = db.prepare('SELECT * FROM conteudos_legado').all();
  if (!legados.length) return;
  const midias = db.prepare('SELECT id, tipo, legenda, publicado_em FROM instagram_midias WHERE removido = 0').all();
  emTransacao(db, () => {
    for (const legado of legados) {
      const pares = paresDoLegado(legado, midias);
      const projetoExiste = db.prepare('SELECT 1 FROM projetos WHERE id = ?').get(legado.projeto_id);
      if (pares.length === 1 && projetoExiste) {
        db.prepare('UPDATE instagram_midias SET projeto_id = ? WHERE id = ? AND projeto_id IS NULL').run(legado.projeto_id, pares[0].id);
        db.prepare('UPDATE projetos SET postou_instagram = 1 WHERE id = ?').run(legado.projeto_id);
      }
    }
    db.exec('DELETE FROM conteudos_legado');
  });
}
