const CAMPOS = ['title', 'description', 'stack', 'status', 'liveUrl', 'codeUrl', 'caseStudy'];
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function diffPortfolio(atual, novo, { hashesAtuais = {}, hashesNovos = {} } = {}) {
  const antes = new Map((atual?.projects ?? []).map((p) => [p.id, p]));
  const depois = new Map(novo.projects.map((p) => [p.id, p]));

  const adicionados = [...depois.values()].filter((p) => !antes.has(p.id)).map((p) => p.title);
  const removidos = [...antes.values()].filter((p) => !depois.has(p.id)).map((p) => p.title);

  const alterados = [];
  for (const p of depois.values()) {
    const anterior = antes.get(p.id);
    if (!anterior) continue;
    const campos = CAMPOS.filter((c) => !igual(anterior[c], p[c]));
    const imagensAntes = anterior.images ?? [];
    const imagensDepois = p.images ?? [];
    let imagensAlteradas = 0;
    for (let i = 0; i < Math.max(imagensAntes.length, imagensDepois.length); i++) {
      const a = imagensAntes[i];
      const b = imagensDepois[i];
      if (a !== b || hashesAtuais[a] !== hashesNovos[b]) imagensAlteradas++;
    }
    if (campos.length || imagensAlteradas) alterados.push({ id: p.id, title: p.title, campos, imagensAlteradas });
  }

  const ordemAlterada = !igual(
    [...antes.keys()].filter((id) => depois.has(id)),
    [...depois.keys()].filter((id) => antes.has(id)),
  );
  const projectsDelivered = { antes: atual?.stats?.projectsDelivered ?? null, depois: novo.stats.projectsDelivered };

  return {
    adicionados,
    removidos,
    alterados,
    ordemAlterada,
    projectsDelivered,
    semMudancas:
      !adicionados.length && !removidos.length && !alterados.length && !ordemAlterada &&
      projectsDelivered.antes === projectsDelivered.depois,
  };
}
