export const TIPOS_SERVICO = ['placas_nfc', 'google_meu_negocio'];
export const SERVICOS = ['site_sistema', 'google_meu_negocio', 'placas_nfc'];

export function valorLinhaServico(servico) {
  return servico.valor_total_centavos ?? servico.valor_unitario_centavos * (servico.quantidade ?? 1);
}

export function calcularValorTotal(servicos, descontoCentavos) {
  const soma = servicos.reduce((total, s) => total + valorLinhaServico(s), 0);
  return Math.max(0, soma - descontoCentavos);
}

const ETAPAS_SERVICO_SIMPLES = ['andamento', 'entregue'];

export function errosDoServico({ servico, etapa, ficticio, tiposLinhas, criando }) {
  const erros = [];
  if (servico !== 'site_sistema') {
    const permitidas = criando ? ['andamento'] : ETAPAS_SERVICO_SIMPLES;
    if (etapa !== undefined && !permitidas.includes(etapa)) erros.push({ campo: 'etapa', mensagem: 'Etapa inválida para este serviço' });
    if (ficticio) erros.push({ campo: 'ficticio', mensagem: 'Só sites e sistemas podem ser fictícios' });
  }
  const linhasObrigatorias = criando && servico === 'placas_nfc';
  if (tiposLinhas || linhasObrigatorias) {
    const tipos = tiposLinhas ?? [];
    if (servico === 'site_sistema' && tipos.length) {
      erros.push({ campo: 'servicos', mensagem: 'Sites e sistemas não têm linhas de serviço' });
    }
    if (servico === 'google_meu_negocio' && tipos.length) {
      erros.push({ campo: 'servicos', mensagem: 'Google Meu Negócio não tem linhas de serviço' });
    }
    if (servico === 'placas_nfc' && !(tipos.length === 1 && tipos[0] === 'placas_nfc')) {
      erros.push({ campo: 'servicos', mensagem: 'Venda de placas precisa de exatamente uma linha de placas' });
    }
  }
  return erros;
}
