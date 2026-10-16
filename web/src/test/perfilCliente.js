export const clienteExemplo = {
  id: 1, nome: 'Ana', empresa: 'Padaria da Ana', email: null, telefone: '11 99999-0000', instagram: null, origem: null, notas: null,
  atualizado_em: 'T', total_faturado_centavos: 150050, projetos: [],
};
export const site = { id: 4, titulo: 'Site', etapa: 'andamento', servico: 'site_sistema', valor_total_centavos: 300000, servicos: [] };
export const gmn = {
  id: 6, titulo: 'Google Meu Negócio', etapa: 'andamento', servico: 'google_meu_negocio', valor_total_centavos: 20000,
  link_perfil: 'https://g.page/ana', notas: null, mensalidade_ativa: 0, servicos: [], atualizado_em: 'T',
};

export function rotasPerfil(extra = {}) {
  return {
    'GET /clientes/1': clienteExemplo,
    'GET /projetos?cliente_id=1': [site, gmn],
    'GET /clientes/1/placas': { vendas_avulsas: [], ja_comprou: 0 },
    'GET /projetos/6/parcelas': { parcelas: [], resumo: {} },
    ...extra,
  };
}
