// Etapas do funil de sites; andamento é a versão final (GMN e placas só usam andamento/entregue).
export const ROTULO_ETAPA = {
  ideia: 'Ideia',
  prototipo: 'Protótipo',
  apresentado: 'Apresentado',
  valor_definido: 'Valor definido',
  teste: 'Em teste',
  andamento: 'Versão final',
  entregue: 'Entregue',
  perdido: 'Perdido',
};
export const ETAPAS = Object.keys(ROTULO_ETAPA);
export const ETAPAS_FICTICIO = ['andamento', 'entregue'];
// "Em andamento" é o que está nas suas mãos: construindo o protótipo ou a versão final.
export const ETAPAS_EM_ANDAMENTO = ['prototipo', 'andamento'];

export const ROTULO_ESTADO_CONTEUDO = {
  rascunho: 'Rascunho', pronto: 'Pronto', agendado: 'Agendado', publicando: 'Publicando…',
  publicado: 'Publicado', falhou: 'Falhou', atrasado: 'Atrasado',
};
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

// Colunas do quadro de tarefas, na ordem em que aparecem.
export const ROTULO_ETAPA_TAREFA = {
  a_fazer: 'A fazer',
  fazendo: 'Fazendo agora',
  aguardando_cliente: 'Aguardando cliente',
  concluido: 'Concluído',
};
export const ETAPAS_TAREFA = Object.keys(ROTULO_ETAPA_TAREFA);
