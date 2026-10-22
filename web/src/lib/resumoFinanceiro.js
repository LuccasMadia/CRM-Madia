// Visão geral do Financeiro em regime de caixa: o que entrou (parcelas e vendas de placa pelo
// dia do pagamento) contra o que saiu (ferramentas e compras de material) em cada mês do ano.

export const CATEGORIAS_RECEITA = [
  { chave: 'site_sistema', nome: 'Sites e sistemas' },
  { chave: 'mensalidades', nome: 'Mensalidades' },
  { chave: 'placas_nfc', nome: 'Placas NFC' },
  { chave: 'google_meu_negocio', nome: 'Google Meu Negócio' },
];

export const CATEGORIAS_CUSTO = [
  { chave: 'ferramentas', nome: 'Ferramentas e assinaturas' },
  { chave: 'material', nome: 'Material de placas' },
];

export const mesesDoAno = (ano) => Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`);

const somaDe = (porMes) => Object.values(porMes).reduce((s, v) => s + v, 0);

function somarDias(iso, dias) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toLocaleDateString('sv-SE');
}

// ferramentasPorMes: [{ mes, ferramentas }] como vem de GET /ferramentas?mes=
export function montarResumo({ ano, hoje, parcelas, lotes, ferramentasPorMes }) {
  const meses = mesesDoAno(ano);
  const mesHoje = hoje.slice(0, 7);
  const zerado = () => Object.fromEntries(meses.map((m) => [m, 0]));
  const receitas = Object.fromEntries(CATEGORIAS_RECEITA.map((c) => [c.chave, zerado()]));
  const custos = Object.fromEntries(CATEGORIAS_CUSTO.map((c) => [c.chave, zerado()]));

  for (const p of parcelas) {
    const mes = p.pago_em?.slice(0, 7);
    if (!mes || !(mes in receitas.site_sistema)) continue;
    const categoria = receitas[p.mensalidade ? 'mensalidades' : p.servico] ?? receitas.site_sistema;
    categoria[mes] += p.valor_centavos;
  }
  for (const l of lotes) {
    const mes = l.data_compra.slice(0, 7);
    if (mes in custos.material) custos.material[mes] += l.valor_kit_centavos + (l.valor_frete_centavos ?? 0);
  }
  for (const { mes, ferramentas } of ferramentasPorMes) {
    if (!(mes in custos.ferramentas) || mes > mesHoje) continue;
    for (const f of ferramentas) {
      // a mensalidade só passa a contar no mês em que a ferramenta foi cadastrada
      if (f.cobranca === 'mensalidade' && f.criado_em && f.criado_em.slice(0, 7) > mes) continue;
      custos.ferramentas[mes] += f.gasto_mes_centavos;
    }
  }

  let acumulado = 0;
  const porMes = meses.map((mes) => {
    const receita = CATEGORIAS_RECEITA.reduce((s, c) => s + receitas[c.chave][mes], 0);
    const custo = CATEGORIAS_CUSTO.reduce((s, c) => s + custos[c.chave][mes], 0);
    acumulado += receita - custo;
    return { mes, receita, custo, resultado: receita - custo, acumulado, futuro: mes > mesHoje };
  });

  const receita = porMes.reduce((s, m) => s + m.receita, 0);
  const custo = porMes.reduce((s, m) => s + m.custo, 0);
  const anoHoje = Number(hoje.slice(0, 4));
  const mesesCorridos = ano < anoHoje ? 12 : ano > anoHoje ? 0 : Number(mesHoje.slice(5));

  const abertas = parcelas.filter((p) => p.estado !== 'paga');
  const limite = somarDias(hoje, 30);
  const proximas = abertas
    .filter((p) => p.estado === 'atrasada' || p.vencimento <= limite)
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));

  return {
    meses: porMes,
    receitas: CATEGORIAS_RECEITA.map((c) => ({ ...c, porMes: receitas[c.chave], total: somaDe(receitas[c.chave]) })),
    custos: CATEGORIAS_CUSTO.map((c) => ({ ...c, porMes: custos[c.chave], total: somaDe(custos[c.chave]) })),
    totais: {
      receita,
      custo,
      resultado: receita - custo,
      margem: receita > 0 ? (receita - custo) / receita : null,
      mediaMensal: mesesCorridos ? Math.round(receita / mesesCorridos) : 0,
    },
    aberto: {
      total: abertas.reduce((s, p) => s + p.valor_centavos, 0),
      atrasado: abertas.filter((p) => p.estado === 'atrasada').reduce((s, p) => s + p.valor_centavos, 0),
      quantidade: abertas.length,
    },
    proximas,
  };
}
