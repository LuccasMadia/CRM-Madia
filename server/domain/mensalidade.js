import { dataNoMes, mesDe, somarMeses } from './datas.js';

export const MODOS_INICIO_MENSALIDADE = ['desenvolvimento', 'entrega', 'data'];

const CAMPO_DO_MODO = { desenvolvimento: 'data_inicio', entrega: 'data_entrega', data: 'mensalidade_inicio_data' };

// Data em que a cobrança começa; null enquanto o gatilho não aconteceu.
export function inicioMensalidade(projeto) {
  const campo = CAMPO_DO_MODO[projeto.mensalidade_inicio_modo] ?? CAMPO_DO_MODO.entrega;
  return projeto[campo] || null;
}

// A 1ª vence na data do gatilho; as seguintes, todo mês no dia escolhido, até o mês de `hoje`.
export function mensalidadesDevidas(projeto, hoje) {
  if (!projeto.mensalidade_ativa) return [];
  const inicio = inicioMensalidade(projeto);
  if (!inicio || mesDe(inicio) > mesDe(hoje)) return [];
  const dia = projeto.mensalidade_dia_vencimento || Number(inicio.slice(8, 10));
  const datas = [inicio];
  for (let i = 1; ; i++) {
    const mes = mesDe(somarMeses(`${mesDe(inicio)}-01`, i));
    if (mes > mesDe(hoje)) break;
    datas.push(dataNoMes(mes, dia));
  }
  return datas;
}

// Mensalidades já criadas acompanham o projeto: as que ainda não venceram passam a usar o valor e o dia novos
// (a 1ª, que vence no gatilho, mantém a data); as atrasadas ficam como foram combinadas. Ao desligar a
// mensalidade, as que ainda não venceram só saem se o Lucca pedir (`apagarAbertas`).
export function planejarMensalidadesAbertas(abertas, antes, depois, hoje, { apagarAbertas = false } = {}) {
  const aVencer = abertas.filter((p) => !p.pago_em && p.vencimento >= hoje);
  if (!depois.mensalidade_ativa) {
    return antes.mensalidade_ativa && apagarAbertas ? aVencer.map((p) => ({ acao: 'remover', id: p.id })) : [];
  }
  const primeira = inicioMensalidade(antes);
  const mudouDia = depois.mensalidade_dia_vencimento && depois.mensalidade_dia_vencimento !== antes.mensalidade_dia_vencimento;
  return aVencer.flatMap((p) => {
    const vencimento = mudouDia && p.vencimento !== primeira ? dataNoMes(mesDe(p.vencimento), depois.mensalidade_dia_vencimento) : p.vencimento;
    const valor_centavos = depois.mensalidade_valor_centavos;
    if (vencimento === p.vencimento && valor_centavos === p.valor_centavos) return [];
    return [{ acao: 'atualizar', id: p.id, valor_centavos, vencimento }];
  });
}
