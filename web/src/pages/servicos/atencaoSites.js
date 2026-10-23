import { diasDesde } from '../../lib/datas.js';

export const DIAS_DE_TESTE = 7;
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

const NO_QUADRO = '/servicos?aba=sites&ver=andamento';
const NO_AR = '/servicos?aba=sites&ver=no_ar';

// Itens da faixa "Pede atenção" de Sites e Sistemas, do mais urgente para o trabalho do dia a dia.
// projetos: só os reais; cada lista pode faltar (erro ao carregar) e então não gera aviso.
export function itensAtencaoSites({ projetos = [], parcelas = [], hospedagens = [], mensalidades = [], hoje }) {
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
