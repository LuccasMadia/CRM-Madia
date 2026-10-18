export const ROTULO_ETAPA = {
  contato: 'Contato',
  proposta: 'Proposta enviada',
  andamento: 'Em andamento',
  entregue: 'Entregue',
  perdido: 'Perdido',
};
export const ETAPAS = Object.keys(ROTULO_ETAPA);
export const ETAPAS_FICTICIO = ['andamento', 'entregue'];

export const ROTULO_ESTADO_CONTEUDO = { rascunho: 'Rascunho', pronto: 'Pronto' };
export const ROTULO_TIPO = { post: 'Post', carrossel: 'Carrossel', reels: 'Reels' };
export const ROTULO_ESTADO_PARCELA = { paga: 'Paga', atrasada: 'Atrasada', pendente: 'Pendente' };


export const ROTULO_TIPO_SERVICO = {
  placas_nfc: 'Placas NFC',
  google_meu_negocio: 'Google Meu Negócio',
};
export const TIPOS_SERVICO = Object.keys(ROTULO_TIPO_SERVICO);
export const ROTULO_SERVICO = { site_sistema: 'Site/Sistema', google_meu_negocio: 'GMN', placas_nfc: 'Placas' };
export const SERVICOS = Object.keys(ROTULO_SERVICO);
export const ABA_DO_SERVICO = { site_sistema: 'sites', google_meu_negocio: 'gmn', placas_nfc: 'placas' };
