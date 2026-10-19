// andamento é a versão final dos sites e o "em andamento" de GMN e placas.
export const ETAPAS = ['ideia', 'prototipo', 'apresentado', 'valor_definido', 'teste', 'andamento', 'entregue', 'perdido'];
export const TIPOS_CONTEUDO = ['post', 'carrossel', 'reels'];
export const ESTADOS_CONTEUDO = ['rascunho', 'pronto'];
export const ESTADOS_PUBLICACAO = ['agendado', 'publicando', 'publicado', 'falhou', 'atrasado'];

function preencherData(atual, mudancas, { campo, valor, campoData }, hoje) {
  const resultado = { ...mudancas };
  const dataAtual = campoData in resultado ? resultado[campoData] : atual?.[campoData];
  if (resultado[campo] === valor && !dataAtual) resultado[campoData] = hoje;
  return resultado;
}

export function aplicarRegrasProjeto(atual, mudancas, hoje) {
  const comInicio = preencherData(atual, mudancas, { campo: 'etapa', valor: 'andamento', campoData: 'data_inicio' }, hoje);
  return preencherData(atual, comInicio, { campo: 'etapa', valor: 'entregue', campoData: 'data_entrega' }, hoje);
}

