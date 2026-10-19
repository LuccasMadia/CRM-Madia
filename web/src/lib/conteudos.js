import { api } from '../api/client.js';

// Salva o planejado (criar ou atualizar). As mídias são enviadas à parte, pelo MidiasConteudo.
export function salvarConteudo(id, dados) {
  return id
    ? api(`/conteudos/${id}`, { method: 'PUT', body: dados })
    : api('/conteudos', { method: 'POST', body: dados });
}
