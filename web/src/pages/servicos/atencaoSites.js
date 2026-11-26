import { diasDesde } from '../../lib/datas.js';
import { DIAS_PARADO, ETAPAS_SEM_PARADO, ROTULO_ETAPA, VEZ_DA_ETAPA } from '../../lib/rotulos.js';

export const DIAS_DE_TESTE = 7;
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

const NO_QUADRO = '/servicos?aba=sites&ver=andamento';
const NO_AR = '/servicos?aba=sites&ver=no_ar';

// Itens da faixa "Pede atenção" de Sites e Sistemas, do mais urgente para o trabalho do dia a dia.
// projetos: só os reais; cada lista pode faltar (erro ao carregar) e então não gera aviso.
export function itensAtencaoSites({ projetos = [], parcelas = [], hospedagens = [], mensalidades = [], githubAlertas = [], supabaseAlertas = [], hoje }) {
  const perigo = [];
  const atencao = [];
  const trabalho = [];
  const tituloDe = (id) => projetos.find((p) => p.id === id)?.titulo ?? 'Site';

  const foraDoAr = hospedagens.filter((h) => h.tipo === 'vercel' && h.status === 'fora_do_ar');
  if (foraDoAr.length === 1) perigo.push({ texto: `${tituloDe(foraDoAr[0].projeto_id)} está fora do ar`, para: `/projetos/${foraDoAr[0].projeto_id}` });
  else if (foraDoAr.length) perigo.push({ texto: `${foraDoAr.length} sites fora do ar`, para: NO_AR });

  // Mensalidade tem aba própria no Financeiro; as parcelas do projeto ficam em Recebimentos.
  const avulsas = parcelas.filter((p) => !p.mensalidade && !p.pago_em);
  const atrasadas = avulsas.filter((p) => p.estado === 'atrasada');
  if (atrasadas.length) perigo.push({ texto: plural(atrasadas.length, 'parcela atrasada', 'parcelas atrasadas'), para: '/financeiro?aba=recebimentos' });
  const mensalidadesAtrasadas = mensalidades.filter((m) => m.servico === 'site_sistema' && m.situacao === 'atrasada');
  if (mensalidadesAtrasadas.length) {
    perigo.push({ texto: plural(mensalidadesAtrasadas.length, 'mensalidade atrasada', 'mensalidades atrasadas'), para: '/financeiro?aba=mensalidades' });
  }
  const vencendo = avulsas.filter((p) => p.estado !== 'atrasada' && -diasDesde(p.vencimento, hoje) <= 7);
  if (vencendo.length) atencao.push({ texto: `${plural(vencendo.length, 'parcela vence', 'parcelas vencem')} em até 7 dias`, para: '/financeiro?aba=recebimentos' });

  for (const p of projetos.filter((x) => x.etapa === 'teste')) {
    const para = `/projetos/${p.id}`;
    if (!p.teste_inicio) {
      atencao.push({ texto: `Teste de ${p.titulo} sem data de início`, para: NO_QUADRO });
      continue;
    }
    const faltam = DIAS_DE_TESTE - diasDesde(p.teste_inicio, hoje);
    if (faltam < 0) perigo.push({ texto: `Teste de ${p.titulo} já acabou`, para });
    else if (faltam <= 1) atencao.push({ texto: `Teste de ${p.titulo} termina ${faltam ? 'amanhã' : 'hoje'}`, para });
  }

  // Projeto parado: muito tempo na mesma etapa (sua ou do cliente). O teste tem prazo próprio, acima.
  const parados = projetos
    .filter((p) => VEZ_DA_ETAPA[p.etapa] && !ETAPAS_SEM_PARADO.includes(p.etapa) && p.etapa_desde && diasDesde(p.etapa_desde, hoje) >= DIAS_PARADO)
    .sort((a, b) => a.etapa_desde.localeCompare(b.etapa_desde));
  if (parados.length === 1) {
    const [p] = parados;
    atencao.push({ texto: `${p.titulo} parado há ${diasDesde(p.etapa_desde, hoje)} dias em ${ROTULO_ETAPA[p.etapa]}`, para: `/projetos/${p.id}` });
  } else if (parados.length) {
    atencao.push({ texto: `${parados.length} projetos parados há ${DIAS_PARADO}+ dias`, para: NO_QUADRO });
  }

  // Versão final sem nenhuma parcela paga: trabalho sem sinal.
  const semPagamento = projetos.filter((p) => p.etapa === 'andamento' && !p.parcelas_pagas);
  if (semPagamento.length === 1) atencao.push({ texto: `${semPagamento[0].titulo} em versão final sem nenhuma parcela paga`, para: `/projetos/${semPagamento[0].id}` });
  else if (semPagamento.length) atencao.push({ texto: `${semPagamento.length} projetos em versão final sem nenhuma parcela paga`, para: NO_QUADRO });

  // Auditoria do GitHub: repositório público depois da entrega é perigo; o resto pede atenção.
  for (const a of githubAlertas) {
    (['publico_entregue', 'publico_interno'].includes(a.codigo) ? perigo : atencao).push({ texto: a.texto, para: a.link });
  }

  // Supabase pausado: se o projeto já foi entregue, o cliente está sem sistema (perigo).
  for (const a of supabaseAlertas) {
    (a.codigo === 'supabase_pausado_entregue' ? perigo : atencao).push({ texto: a.texto, para: a.link });
  }

  // O trabalho ativo: um projeto só leva direto a ele; vários levam ao quadro.
  for (const [etapa, rotulo] of [['prototipo', 'em protótipo'], ['andamento', 'em versão final']]) {
    const daEtapa = projetos.filter((p) => p.etapa === etapa);
    if (daEtapa.length === 1) trabalho.push({ texto: `${daEtapa[0].titulo} ${rotulo}`, para: `/projetos/${daEtapa[0].id}` });
    else if (daEtapa.length) trabalho.push({ texto: `${daEtapa.length} ${rotulo}`, para: NO_QUADRO });
  }

  return [
    ...perigo.map((i) => ({ ...i, tom: 'perigo' })),
    ...atencao.map((i) => ({ ...i, tom: 'atencao' })),
    ...trabalho,
  ];
}
