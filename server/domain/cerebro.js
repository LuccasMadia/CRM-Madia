import { dataValida, somarDias } from './datas.js';

export const SERVICOS_ORDEM = ['site_sistema', 'google_meu_negocio', 'placas_nfc'];

// Prazo vazio ou fora do formato AAAA-MM-DD nunca vence.
export function tarefaVencida(tarefa, hoje) {
  return !tarefa.concluida && dataValida(tarefa.prazo) && tarefa.prazo < hoje;
}

// Entregue só interessa se foi nos últimos 30 dias (inclusive) ou se ainda tem algo pendurado.
export function entregueRelevante(projeto, { tarefasAbertas, parcelasAbertas }, hoje) {
  if (tarefasAbertas > 0 || parcelasAbertas > 0) return true;
  return Boolean(projeto.data_entrega) && projeto.data_entrega >= somarDias(hoje, -30);
}
