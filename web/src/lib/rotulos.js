export const ROTULO_ETAPA = {
  contato: 'Contato',
  proposta: 'Proposta enviada',
  andamento: 'Em andamento',
  entregue: 'Entregue',
  perdido: 'Perdido',
};
export const ETAPAS = Object.keys(ROTULO_ETAPA);
export const ETAPAS_FICTICIO = ['andamento', 'entregue'];

export const ROTULO_STATUS_CONTEUDO = { ideia: 'Ideia', produzindo: 'Produzindo', agendado: 'Agendado', publicado: 'Publicado' };
export const STATUS_CONTEUDO = Object.keys(ROTULO_STATUS_CONTEUDO);

export const ROTULO_CANAL = { instagram: 'Instagram', portfolio: 'Portfólio' };
export const ROTULO_TIPO = { post: 'Post', carrossel: 'Carrossel', reels: 'Reels', story: 'Story', atualizacao: 'Atualização de case' };
export const ROTULO_ESTADO_PARCELA = { paga: 'Paga', atrasada: 'Atrasada', pendente: 'Pendente' };

export const ROTULO_CATEGORIA_QR = { avaliacao: 'Avaliação', cardapio: 'Cardápio' };
export const CATEGORIAS_QR = Object.keys(ROTULO_CATEGORIA_QR);
export const ROTULO_STATUS_QR = { ativo: 'Ativo', arquivado: 'Arquivado' };
export const STATUS_QR = Object.keys(ROTULO_STATUS_QR);

export const ROTULO_TIPO_SERVICO = {
  placas_nfc: 'Placas NFC',
  sistemas: 'Sistemas',
  saas: 'SaaS',
  google_meu_negocio: 'Google Meu Negócio',
};
export const TIPOS_SERVICO = Object.keys(ROTULO_TIPO_SERVICO);
export const ROTULO_SERVICO = { site_sistema: 'Site/Sistema', google_meu_negocio: 'GMN', placas_nfc: 'Placas' };
export const SERVICOS = Object.keys(ROTULO_SERVICO);
export const TIPOS_SERVICO_SITE = ['sistemas', 'saas'];
export const ABA_DO_SERVICO = { site_sistema: 'sites', google_meu_negocio: 'gmn', placas_nfc: 'placas' };
