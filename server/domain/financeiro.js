import { mesDe } from './datas.js';

export function estadoParcela(parcela, hoje) {
  if (parcela.pago_em) return 'paga';
  return parcela.vencimento < hoje ? 'atrasada' : 'pendente';
}

export function resumoParcelas(parcelas, hoje, valorTotalCentavos = 0) {
  const resumo = { total_centavos: 0, pago_centavos: 0, pendente_centavos: 0, atrasado_centavos: 0 };
  for (const parcela of parcelas) {
    resumo.total_centavos += parcela.valor_centavos;
    const estado = estadoParcela(parcela, hoje);
    if (estado === 'paga') resumo.pago_centavos += parcela.valor_centavos;
    else if (estado === 'atrasada') resumo.atrasado_centavos += parcela.valor_centavos;
    else resumo.pendente_centavos += parcela.valor_centavos;
  }
  resumo.nao_parcelado_centavos = valorTotalCentavos - resumo.total_centavos;
  return resumo;
}

export function aReceberNoMes(parcelas, hoje) {
  const mes = mesDe(hoje);
  return parcelas
    .filter((p) => !p.pago_em && mesDe(p.vencimento) === mes)
    .reduce((soma, p) => soma + p.valor_centavos, 0);
}

export function recebidoPorMes(parcelas, ano) {
  const meses = Array.from({ length: 12 }, (_, i) => ({
    mes: `${ano}-${String(i + 1).padStart(2, '0')}`,
    recebido_centavos: 0,
  }));
  for (const parcela of parcelas) {
    if (!parcela.pago_em?.startsWith(`${ano}-`)) continue;
    meses[Number(parcela.pago_em.slice(5, 7)) - 1].recebido_centavos += parcela.valor_centavos;
  }
  return meses;
}
