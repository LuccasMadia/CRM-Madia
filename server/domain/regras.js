export const ETAPAS = ['contato', 'proposta', 'andamento', 'entregue', 'perdido'];
export const CANAIS = ['instagram', 'portfolio'];
export const TIPOS_CONTEUDO = ['post', 'carrossel', 'reels', 'story', 'atualizacao'];
export const STATUS_CONTEUDO = ['ideia', 'produzindo', 'agendado', 'publicado'];

function preencherData(atual, mudancas, { campo, valor, campoData }, hoje) {
  const resultado = { ...mudancas };
  const dataAtual = campoData in resultado ? resultado[campoData] : atual?.[campoData];
  if (resultado[campo] === valor && !dataAtual) resultado[campoData] = hoje;
  return resultado;
}

export function aplicarRegrasProjeto(atual, mudancas, hoje) {
  return preencherData(atual, mudancas, { campo: 'etapa', valor: 'entregue', campoData: 'data_entrega' }, hoje);
}

export function aplicarRegrasConteudo(atual, mudancas, hoje) {
  return preencherData(atual, mudancas, { campo: 'status', valor: 'publicado', campoData: 'data_publicada' }, hoje);
}
