import { somarDias } from './datas.js';

export function montarProximos({ tarefas = [], parcelas = [], entregas = [], conteudos = [] }, hoje, dias = 7) {
  const limite = somarDias(hoje, dias);
  const itens = [
    ...tarefas.map((t) => ({
      tipo: 'tarefa', id: t.id, projeto_id: t.projeto_id, titulo: t.texto, contexto: t.projeto_titulo, data: t.prazo,
    })),
    ...parcelas.map((p) => ({
      tipo: 'parcela', id: p.id, projeto_id: p.projeto_id, titulo: p.descricao || 'Parcela',
      contexto: p.projeto_titulo, data: p.vencimento, valor_centavos: p.valor_centavos,
    })),
    ...entregas.map((e) => ({
      tipo: 'entrega', id: e.id, projeto_id: e.id, titulo: e.titulo, contexto: e.cliente_nome, data: e.prazo_entrega,
    })),
    ...conteudos.map((c) => ({
      tipo: 'conteudo', id: c.id, projeto_id: c.projeto_id ?? null, titulo: c.titulo, contexto: c.canal, data: c.data_planejada,
    })),
  ];
  return itens
    .filter((i) => i.data && i.data <= limite)
    .map((i) => ({ ...i, atrasado: i.data < hoje }))
    .sort((a, b) => a.data.localeCompare(b.data));
}
