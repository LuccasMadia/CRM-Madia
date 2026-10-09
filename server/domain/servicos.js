export const TIPOS_SERVICO = ['placas_nfc', 'sistemas', 'saas', 'google_meu_negocio'];

export function valorLinhaServico(servico) {
  return servico.valor_unitario_centavos * (servico.quantidade ?? 1);
}

export function calcularValorTotal(servicos, descontoCentavos) {
  const soma = servicos.reduce((total, s) => total + valorLinhaServico(s), 0);
  return Math.max(0, soma - descontoCentavos);
}
