import { api } from '../api/client.js';

// Classe da etiqueta (etiqueta--X) de cada estado do conteúdo.
export const CLASSE_ESTADO_CONTEUDO = {
  rascunho: 'rascunho',
  pronto: 'pronto',
  agendado: 'agendado',
  publicando: 'andamento',
  publicado: 'publicado',
  falhou: 'atrasada',
  atrasado: 'atrasada',
};

// Salva o planejado (criar ou atualizar). As mídias são enviadas à parte, pelo MidiasConteudo.
export function salvarConteudo(id, dados) {
  return id
    ? api(`/conteudos/${id}`, { method: 'PUT', body: dados })
    : api('/conteudos', { method: 'POST', body: dados });
}
