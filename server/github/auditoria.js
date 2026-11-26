const DIAS_SEM_COMMIT = 30;
const diasEntre = (de, ate) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86400000);

// Cruza os repositórios do GitHub com os projetos do CRM. Funções puras, sem I/O.
const ETAPAS_COM_REPO = ['andamento', 'teste', 'entregue'];
const LINK_VISAO = '/servicos?aba=sites&ver=github';

const semAcento = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const chave = (t) => semAcento(t).toLowerCase().replace(/[^a-z0-9]/g, '');
const slug = (t) => semAcento(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function nomeDoRepositorio(titulo, usados) {
  const base = slug(titulo) || 'projeto';
  let nome = base;
  for (let n = 2; usados.has(nome); n += 1) nome = `${base}-${n}`;
  return nome;
}

export function montarAuditoria({ repositorios, projetos, hoje = new Date().toISOString().slice(0, 10) }) {
  const porRepo = new Map(projetos.filter((p) => p.github_repo).map((p) => [p.github_repo.toLowerCase(), p]));
  const livres = projetos.filter((p) => !p.github_repo && p.servico === 'site_sistema');
  const alertas = [];

  const itens = repositorios.map((repo) => {
    const ligado = porRepo.get(repo.nome_completo.toLowerCase()) ?? null;
    const visibilidade = repo.privado ? 'privado' : 'publico';
    const codigos = [];
    if (ligado && !repo.privado) {
      if (ligado.privado) {
        codigos.push('publico_interno');
        alertas.push({ codigo: 'publico_interno', texto: `${ligado.titulo} é interno e o repositório ${repo.nome_completo} está público`, link: `/projetos/${ligado.id}` });
      } else if (!ligado.ficticio && ligado.etapa === 'entregue') {
        codigos.push('publico_entregue');
        alertas.push({ codigo: 'publico_entregue', texto: `${ligado.titulo} já foi entregue e o repositório ${repo.nome_completo} está público`, link: `/projetos/${ligado.id}` });
      }
    }
    if (ligado && !ligado.ficticio && !ligado.privado && !['entregue', 'perdido'].includes(ligado.etapa) && repo.ultimo_commit_em) {
      const dias = diasEntre(repo.ultimo_commit_em.slice(0, 10), hoje);
      if (dias >= DIAS_SEM_COMMIT) {
        codigos.push('sem_commit');
        alertas.push({ codigo: 'sem_commit', texto: `${ligado.titulo} sem commit há ${dias} dias`, link: `/projetos/${ligado.id}` });
      }
    }
    if (!ligado && !repo.arquivado && !repo.fork) {
      codigos.push('sem_projeto');
      alertas.push({ codigo: 'sem_projeto', texto: `Repositório ${repo.nome_completo} não tem projeto no CRM`, link: LINK_VISAO });
    }
    const nomeCurto = chave(repo.nome_completo.split('/')[1]);
    const sugerido = ligado ? null : livres.find((p) => chave(p.titulo) === nomeCurto) ?? null;
    return {
      repo,
      projeto: ligado && { id: ligado.id, titulo: ligado.titulo, etapa: ligado.etapa },
      sugestao: sugerido && { id: sugerido.id, titulo: sugerido.titulo },
      visibilidade,
      alertas: codigos,
    };
  });

  const projetos_sem_repo = projetos
    .filter((p) => p.servico === 'site_sistema' && !p.ficticio && !p.github_repo && ETAPAS_COM_REPO.includes(p.etapa))
    .map((p) => ({ id: p.id, titulo: p.titulo, etapa: p.etapa }));
  for (const p of projetos_sem_repo) {
    alertas.push({ codigo: 'projeto_sem_repo', texto: `${p.titulo} não tem repositório no GitHub`, link: `/projetos/${p.id}` });
  }

  return { itens, projetos_sem_repo, alertas };
}
