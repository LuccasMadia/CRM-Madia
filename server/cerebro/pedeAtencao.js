const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

// Mesma contagem do relatório (pede_acao), só reescrita para a tela.
export function pedeAtencao(pa) {
  const { projetos_atrasados: projs, parcelas_atrasadas: parc, sites_fora_do_ar: sites, tarefas_vencidas: tars } = pa;
  const grupos = [
    [projs.length, plural(projs.length, 'projeto atrasado', 'projetos atrasados'), 'perigo',
      projs[0] && `/projetos/${projs[0].projeto_id}`, '/servicos?aba=sites'],
    [parc.quantidade, plural(parc.quantidade, 'parcela atrasada', 'parcelas atrasadas'), 'perigo',
      parc.itens[0] && (parc.itens[0].projeto_id ? `/projetos/${parc.itens[0].projeto_id}` : '/financeiro'), '/financeiro'],
    [sites.length, plural(sites.length, 'site fora do ar', 'sites fora do ar'), 'perigo',
      sites[0] && `/projetos/${sites[0].projeto_id}`, '/servicos?aba=sites'],
    [tars.length, plural(tars.length, 'tarefa vencida', 'tarefas vencidas'), 'atencao',
      tars[0] && (tars[0].projeto_id ? `/projetos/${tars[0].projeto_id}` : '/tarefas'), '/tarefas'],
  ];
  return grupos.filter(([n]) => n > 0).map(([n, texto, tom, unico, varios]) => ({ texto, tom, para: n === 1 ? unico : varios }));
}
