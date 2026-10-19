import { somarDias } from '../domain/datas.js';
import { estadoParcela } from '../domain/financeiro.js';

export const PRAZO_PADRAO_DIAS = 7;

export function situacaoCobranca({ projeto, hospedagem, parcelas, hoje, prazoDias }) {
  if (projeto.ficticio) return null;
  if (hospedagem?.tipo !== 'vercel') return null;

  const atrasadas = parcelas.filter((p) => p.mensalidade && estadoParcela(p, hoje) === 'atrasada');
  const pausado = hospedagem.status === 'pausado';
  const avisado_em = hospedagem.cliente_avisado_em ?? null;

  if (atrasadas.length === 0) {
    if (pausado && projeto.mensalidade_ativa) {
      return { fase: 'pago_pausado', atrasada_desde: null, valor_centavos: 0, avisado_em, prazo_ate: null };
    }
    return null;
  }

  const atrasada_desde = atrasadas.map((p) => p.vencimento).sort()[0];
  const valor_centavos = atrasadas.reduce((soma, p) => soma + p.valor_centavos, 0);
  const prazo_ate = avisado_em ? somarDias(avisado_em, prazoDias) : null;

  let fase = 'atrasada';
  if (pausado) fase = 'pausado_atrasado';
  else if (avisado_em) fase = hoje >= prazo_ate ? 'prazo_vencido' : 'avisado';

  return { fase, atrasada_desde, valor_centavos, avisado_em, prazo_ate };
}
