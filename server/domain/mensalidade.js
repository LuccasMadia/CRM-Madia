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

export const TIPOS_MENSALIDADE = ['site', 'sistema', 'saas', 'gmn', 'placas'];

// Site com várias categorias vai para o grupo mais "pesado": SaaS > Sistema > Site (landing page conta como site).
export function tipoDaMensalidade(servico, nomesCategorias = []) {
  if (servico === 'google_meu_negocio') return 'gmn';
  if (servico === 'placas_nfc') return 'placas';
  const nomes = nomesCategorias.map((n) => n.trim().toLowerCase());
  if (nomes.includes('saas')) return 'saas';
  if (nomes.includes('sistema')) return 'sistema';
  return 'site';
}

// Situação de um projeto que cobra (ou já cobrou) mensalidade, lida das cobranças que existem.
// aguardando: ligada, mas o gatilho de início ainda não aconteceu · desligada: não cobra mais, mas ficou algo em aberto.
export function situacaoMensalidade(projeto, mensalidades, hoje) {
  const abertas = mensalidades.filter((p) => !p.pago_em).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const atrasadas = abertas.filter((p) => p.vencimento < hoje);
  const pagas = mensalidades.filter((p) => p.pago_em).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const inicio = inicioMensalidade(projeto);
  let situacao = 'em_dia';
  if (!projeto.mensalidade_ativa) situacao = 'desligada';
  else if (atrasadas.length) situacao = 'atrasada';
  else if (!inicio || inicio > hoje) situacao = 'aguardando';
  const proxima = abertas.find((p) => p.vencimento >= hoje) ?? null;
  const ultimaPaga = pagas.at(-1) ?? null;
  return {
    situacao,
    inicio,
    atrasadas: atrasadas.length,
    atrasado_centavos: atrasadas.reduce((s, p) => s + p.valor_centavos, 0),
    atrasada_desde: atrasadas[0]?.vencimento ?? null,
    proxima: proxima && { id: proxima.id, vencimento: proxima.vencimento, valor_centavos: proxima.valor_centavos },
    // parcela mais antiga em aberto: é a que o "Marcar paga" quita
    em_aberto: abertas[0] ? { id: abertas[0].id, vencimento: abertas[0].vencimento, valor_centavos: abertas[0].valor_centavos } : null,
    ultima_paga: ultimaPaga && { vencimento: ultimaPaga.vencimento, pago_em: ultimaPaga.pago_em },
  };
}
