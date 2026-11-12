import { Router } from 'express';
import { gerarTodasMensalidades } from '../repos/mensalidades.js';
import { montarRelatorioProjetos } from '../cerebro/relatorio.js';
import { lerPasta } from '../cerebro/pasta.js';
import { montarMemoria } from '../cerebro/memoria.js';
import { obterConfig } from '../repos/config.js';

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

// Mesma contagem do relatório (pede_acao), só reescrita para a tela.
function pedeAtencao(pa) {
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

export function rotasCerebro({ db, hoje }) {
  const r = Router();

  r.get('/cerebro/projetos', (req, res) => {
    gerarTodasMensalidades(db, hoje());
    res.json(montarRelatorioProjetos(db, hoje()));
  });

  r.get('/cerebro', (req, res) => {
    gerarTodasMensalidades(db, hoje());
    const pasta = lerPasta(obterConfig(db, 'cerebro_path') || null);
    res.json({
      centro: pasta.centro,
      skills: pasta.skills,
      rotinas: pasta.rotinas,
      apps: pasta.apps_base.map((a) => ({
        ...a, conectado: Boolean(typeof a.conexao === 'string' && a.conexao.startsWith('crm:') && obterConfig(db, a.conexao.slice(4))),
      })),
      memoria: montarMemoria(db, hoje()),
      pede_atencao: pedeAtencao(montarRelatorioProjetos(db, hoje()).pede_acao),
      avisos: pasta.avisos,
    });
  });

  return r;
}
