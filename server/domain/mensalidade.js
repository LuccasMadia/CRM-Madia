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
