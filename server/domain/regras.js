export const ETAPAS = ['contato', 'proposta', 'andamento', 'entregue', 'perdido'];
export const TIPOS_CONTEUDO = ['post', 'carrossel', 'reels'];
export const ESTADOS_CONTEUDO = ['rascunho', 'pronto'];

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

