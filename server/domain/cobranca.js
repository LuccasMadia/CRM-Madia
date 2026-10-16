// Decide o que fazer com a parcela "Pagamento" de um GMN ou venda de placas.
// `avulsas` são as parcelas do projeto que não são mensalidade.
export function planejarCobrancaUnica(avulsas, { valorCentavos, vencimento }) {
  if (avulsas.length > 1) return { acao: 'nada' };
  const [parcela] = avulsas;
  if (!parcela) {
    return valorCentavos > 0 && vencimento
      ? { acao: 'criar', valor_centavos: valorCentavos, vencimento }
      : { acao: 'nada' };
  }
  if (parcela.pago_em) return { acao: 'nada' };
  if (valorCentavos <= 0) return { acao: 'remover', id: parcela.id };
  return { acao: 'atualizar', id: parcela.id, valor_centavos: valorCentavos, vencimento: vencimento ?? parcela.vencimento };
}
