import { formatarDinheiro } from '../lib/dinheiro.js';
import { formatarData } from '../lib/datas.js';

// Frase da situação de cobrança de um site (usada na aba Hospedagem e nos avisos do Início).
export function TextoCobranca({ cobranca, prazoDias }) {
  const { fase } = cobranca;
  const atraso = `Mensalidade de ${formatarDinheiro(cobranca.valor_centavos)} atrasada desde ${formatarData(cobranca.atrasada_desde)}`;
  if (fase === 'atrasada') return <p>{atraso}</p>;
  if (fase === 'avisado') return <p>Cliente avisado em {formatarData(cobranca.avisado_em)} — prazo até {formatarData(cobranca.prazo_ate)}</p>;
  if (fase === 'prazo_vencido') return <p>Prazo de {prazoDias} dias venceu — tirar do ar?</p>;
  if (fase === 'pausado_atrasado') return <p>{atraso}. O site já está fora do ar.</p>;
  if (fase === 'pago_pausado') return <p>Pago — colocar no ar?</p>;
  return null;
}
