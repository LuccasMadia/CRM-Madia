import { somarMeses, mesDe } from './datas.js';

export const ETAPAS_FUNIL = ['contato', 'proposta', 'andamento', 'entregue'];
export const SERVICOS_GRAFICO = ['site_sistema', 'google_meu_negocio', 'placas_nfc'];
const NAO_INFORMADO = 'Não informado';
const MAX_FATIAS = 4;

export function ultimosMeses(hoje, n) {
  const primeiroDia = `${mesDe(hoje)}-01`;
  return Array.from({ length: n }, (_, i) => mesDe(somarMeses(primeiroDia, i - (n - 1))));
}

export function montarFunil(projetos) {
  const sites = projetos.filter((p) => p.servico === 'site_sistema');
  // Até que etapa o projeto chegou; perdido só conta como contato.
  const alcance = (p) => (p.etapa === 'perdido' ? 0 : ETAPAS_FUNIL.indexOf(p.etapa));
  const contato = sites.length;
  const etapas = ETAPAS_FUNIL.map((etapa, i) => {
    const quantidade = sites.filter((p) => alcance(p) >= i).length;
    return { etapa, quantidade, percentual: contato ? Math.round((quantidade / contato) * 100) : 0 };
  });
  return { etapas, perdidos: sites.filter((p) => p.etapa === 'perdido').length };
}

function somarPagasPorMes(parcelas, meses, chave = () => '') {
  const janela = new Set(meses);
  const totais = new Map();
  for (const p of parcelas) {
    if (!p.pago_em || !janela.has(mesDe(p.pago_em))) continue;
    const k = `${chave(p)}|${mesDe(p.pago_em)}`;
    totais.set(k, (totais.get(k) ?? 0) + p.valor_centavos);
  }
  return totais;
}

export function recebidoPorMes(parcelas, hoje) {
  const meses = ultimosMeses(hoje, 6);
  const totais = somarPagasPorMes(parcelas, meses);
  return meses.map((mes) => ({ mes, total_centavos: totais.get(`|${mes}`) ?? 0 }));
}

export function faturamentoPorServico(parcelas, hoje) {
  const meses = ultimosMeses(hoje, 12);
  const totais = somarPagasPorMes(parcelas, meses, (p) => p.servico);
  return SERVICOS_GRAFICO.map((servico) => ({
    servico,
    total_centavos: meses.reduce((soma, mes) => soma + (totais.get(`${servico}|${mes}`) ?? 0), 0),
  }));
}

const grafiaMaisComum = (grafias) =>
  [...grafias].sort(([a, na], [b, nb]) => nb - na || a.localeCompare(b, 'pt-BR'))[0][0];

export function agruparOrigens(clientes) {
  const grupos = new Map();
  for (const c of clientes) {
    const texto = (c.origem ?? '').trim();
    const chave = texto.toLowerCase();
    const nome = texto || NAO_INFORMADO;
    const grupo = grupos.get(chave) ?? { quantidade: 0, grafias: new Map() };
    grupo.quantidade += 1;
    grupo.grafias.set(nome, (grupo.grafias.get(nome) ?? 0) + 1);
    grupos.set(chave, grupo);
  }
  const fatias = [...grupos.values()]
    .map((g) => ({ nome: grafiaMaisComum(g.grafias), quantidade: g.quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade || a.nome.localeCompare(b.nome, 'pt-BR'));
  const resto = fatias.slice(MAX_FATIAS).reduce((soma, f) => soma + f.quantidade, 0);
  const principais = fatias.slice(0, MAX_FATIAS);
  return { total: clientes.length, fatias: resto ? [...principais, { nome: 'Outros', quantidade: resto }] : principais };
}
