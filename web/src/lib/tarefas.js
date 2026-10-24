import { diasDesde, hojeISO } from './datas.js';

// Tipos fixos de tarefa, na ordem em que aparecem nos seletores e filtros.
export const TIPOS_TAREFA = {
  site_sistema: { rotulo: 'Site/Sistema', icone: 'site' },
  google_meu_negocio: { rotulo: 'Google Meu Negócio', icone: 'gmn' },
  placas_nfc: { rotulo: 'Placas NFC', icone: 'nfc' },
  conteudo: { rotulo: 'Conteúdo', icone: 'conteudo' },
  cobranca: { rotulo: 'Cobrança', icone: 'financeiro' },
  comercial: { rotulo: 'Comercial', icone: 'comercial' },
  interno: { rotulo: 'Interno', icone: 'configuracoes' },
};
export const TIPOS = Object.keys(TIPOS_TAREFA);

export const ROTULO_PRIORIDADE = { urgente: 'Urgente', alta: 'Alta', normal: 'Normal', baixa: 'Baixa' };
export const PRIORIDADES = Object.keys(ROTULO_PRIORIDADE);

// Prazo curto no cartão: o ano só aparece quando não é o ano corrente.
export function prazoCurto(iso, hoje = hojeISO()) {
  const [ano, mes, dia] = iso.split('-');
  return ano === hoje.slice(0, 4) ? `${dia}/${mes}` : `${dia}/${mes}/${ano}`;
}

export const estaAtrasada = (t, hoje = hojeISO()) => t.etapa !== 'concluido' && Boolean(t.prazo) && t.prazo < hoje;

// Dias parada na etapa atual (para "aguardando cliente há N dias"); null sem data.
export const diasNaEtapa = (t, hoje = hojeISO()) => (t.etapa_desde ? Math.max(0, diasDesde(t.etapa_desde.slice(0, 10), hoje)) : null);

export const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

// Quebra o texto em pedaços de texto e links, para a descrição mostrar links clicáveis.
// O fim do link não leva a pontuação da frase ("veja https://x.com.").
const LINK = /(https?:\/\/[^\s<]*[^\s<.,;:!?)\]'"]|www\.[^\s<]*[^\s<.,;:!?)\]'"])/;
export function partesComLinks(texto) {
  // split com grupo de captura intercala texto e links: os ímpares são os links.
  return String(texto ?? '').split(LINK).map((p, i) => (
    i % 2 ? { link: p.startsWith('www.') ? `https://${p}` : p, texto: p } : { texto: p }
  )).filter((p) => p.texto !== '');
}
