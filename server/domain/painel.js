export function agruparTarefasPorProjeto(linhas) {
  const grupos = new Map();
  for (const l of linhas) {
    if (!grupos.has(l.projeto_id)) {
      grupos.set(l.projeto_id, { projeto_id: l.projeto_id, projeto_titulo: l.projeto_titulo, ficticio: Boolean(l.ficticio), tarefas: [] });
    }
    grupos.get(l.projeto_id).tarefas.push({ id: l.id, texto: l.texto, prazo: l.prazo, etapa: l.etapa });
  }
  const projetos = [...grupos.values()];
  const semFicticio = ({ ficticio, ...resto }) => resto;
  return {
    reais: projetos.filter((p) => !p.ficticio).map(semFicticio),
    ficticios: projetos.filter((p) => p.ficticio).map(semFicticio),
  };
}

// Um item por projeto entregue, com os canais onde ele ainda não foi mostrado.
export function montarDivulgacao(linhas) {
  return linhas
    .map((p) => ({
      projeto_id: p.id,
      projeto_titulo: p.titulo,
      ficticio: Boolean(p.ficticio),
      falta: [!p.postou_instagram && 'instagram', !p.portfolio_publicado && 'portfolio'].filter(Boolean),
    }))
    .filter((p) => p.falta.length);
}
