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

const somarDias = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
// Domingo que fecha a semana de hoje (a semana vai de segunda a domingo).
const fimDaSemana = (hoje) => somarDias(hoje, (7 - new Date(`${hoje}T12:00:00Z`).getUTCDay()) % 7);

// Grupos da visão Lista, na ordem em que aparecem; Concluídas vêm por último, recolhidas.
export const GRUPOS_PRAZO = [
  ['atrasadas', 'Atrasadas'], ['hoje', 'Hoje'], ['amanha', 'Amanhã'], ['semana', 'Esta semana'],
  ['depois', 'Depois'], ['sem_prazo', 'Sem prazo'], ['concluidas', 'Concluídas'],
];

export function grupoDoPrazo(t, hoje = hojeISO()) {
  if (t.etapa === 'concluido') return 'concluidas';
  if (!t.prazo) return 'sem_prazo';
  if (t.prazo < hoje) return 'atrasadas';
  if (t.prazo === hoje) return 'hoje';
  if (t.prazo === somarDias(hoje, 1)) return 'amanha';
  return t.prazo <= fimDaSemana(hoje) ? 'semana' : 'depois';
}

// Dentro do grupo: prazo mais cedo primeiro e, no mesmo dia, urgente/alta antes das outras.
const PESO_PRIORIDADE = { urgente: 0, alta: 1, normal: 2, baixa: 3 };
export function agruparPorPrazo(tarefas, hoje = hojeISO()) {
  const grupos = Object.fromEntries(GRUPOS_PRAZO.map(([chave]) => [chave, []]));
  for (const t of tarefas) grupos[grupoDoPrazo(t, hoje)].push(t);
  const ordem = (a, b) => (a.prazo ?? '').localeCompare(b.prazo ?? '')
    || (PESO_PRIORIDADE[a.prioridade] ?? 2) - (PESO_PRIORIDADE[b.prioridade] ?? 2) || a.id - b.id;
  for (const lista of Object.values(grupos)) lista.sort(ordem);
  grupos.concluidas.sort((a, b) => (b.concluida_em ?? '').localeCompare(a.concluida_em ?? '') || b.id - a.id);
  return grupos;
}

export const DIAS_AGUARDANDO = 5;

// Recortes que a faixa "Pede atenção" aplica (?foco=...) sobre a lista carregada, e a visão que abrem.
export const FOCOS = {
  atrasadas: { rotulo: 'Atrasadas', visao: 'lista', filtro: (t, hoje) => estaAtrasada(t, hoje) },
  hoje: { rotulo: 'Vencem hoje', visao: 'lista', filtro: (t, hoje) => t.etapa !== 'concluido' && t.prazo === hoje },
  aguardando: {
    rotulo: `Aguardando cliente há mais de ${DIAS_AGUARDANDO} dias`, visao: 'quadro',
    filtro: (t, hoje) => t.etapa === 'aguardando_cliente' && diasNaEtapa(t, hoje) > DIAS_AGUARDANDO,
  },
  urgentes: { rotulo: 'Urgentes abertas', visao: 'quadro', filtro: (t) => t.etapa !== 'concluido' && t.prioridade === 'urgente' },
};

// Itens da faixa "Pede atenção" das tarefas, do mais grave para o menos.
export function itensAtencaoTarefas(tarefas, hoje = hojeISO()) {
  const contar = (foco) => tarefas.filter((t) => FOCOS[foco].filtro(t, hoje)).length;
  const para = (foco) => `/tarefas?foco=${foco}&ver=${FOCOS[foco].visao}`;
  const itens = [];
  const atrasadas = contar('atrasadas');
  if (atrasadas) itens.push({ texto: plural(atrasadas, 'tarefa atrasada', 'tarefas atrasadas'), tom: 'perigo', para: para('atrasadas') });
  const urgentes = contar('urgentes');
  if (urgentes) itens.push({ texto: plural(urgentes, 'urgente aberta', 'urgentes abertas'), tom: 'perigo', para: para('urgentes') });
  const hojeN = contar('hoje');
  if (hojeN) itens.push({ texto: `${plural(hojeN, 'vence', 'vencem')} hoje`, tom: 'atencao', para: para('hoje') });
  const aguardando = contar('aguardando');
  if (aguardando) itens.push({ texto: `${aguardando} aguardando cliente há mais de ${DIAS_AGUARDANDO} dias`, tom: 'atencao', para: para('aguardando') });
  return itens;
}
