import { randomBytes } from 'node:crypto';
import { obterConfig, definirConfig } from '../repos/config.js';
import { gerarIcs } from './ics.js';

const brl = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Tarefas abertas com prazo + parcelas ainda não pagas.
export function montarAgenda(db) {
  const tarefas = db.prepare(`
    SELECT t.id, t.texto, t.prazo, c.nome AS cliente FROM tarefas t
    LEFT JOIN clientes c ON c.id = t.cliente_id
    WHERE t.etapa != 'concluido' AND t.prazo IS NOT NULL`).all();
  const parcelas = db.prepare(`
    SELECT pa.id, pa.descricao, pa.valor_centavos, pa.vencimento, p.titulo AS projeto, c.nome AS cliente
    FROM parcelas pa JOIN projetos p ON p.id = pa.projeto_id LEFT JOIN clientes c ON c.id = p.cliente_id
    WHERE pa.pago_em IS NULL`).all();
  return gerarIcs([
    ...tarefas.map((t) => ({ uid: `tarefa-${t.id}`, data: t.prazo, titulo: t.texto, descricao: t.cliente ? `Cliente: ${t.cliente}` : '' })),
    ...parcelas.map((p) => ({ uid: `parcela-${p.id}`, data: p.vencimento, titulo: `Receber ${brl(p.valor_centavos)}${p.cliente ? ` — ${p.cliente}` : ''}`, descricao: [p.projeto, p.descricao].filter(Boolean).join(' · ') })),
  ]);
}

export const tokenAgenda = (db) => obterConfig(db, 'agenda_token');
export const gerarTokenAgenda = (db) => {
  const token = randomBytes(24).toString('hex');
  definirConfig(db, 'agenda_token', token);
  return token;
};
export const desligarAgenda = (db) => db.prepare("DELETE FROM config WHERE chave = 'agenda_token'").run();
