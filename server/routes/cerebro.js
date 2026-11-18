import { Router } from 'express';
import { gerarTodasMensalidades } from '../repos/mensalidades.js';
import { montarRelatorioProjetos } from '../cerebro/relatorio.js';
import { pedeAtencao } from '../cerebro/pedeAtencao.js';
import { lerPasta } from '../cerebro/pasta.js';
import { montarMemoria } from '../cerebro/memoria.js';
import { obterConfig } from '../repos/config.js';

const areaArquivos = (arquivos) => ({
  id: 'arquivos',
  rotulo: 'Arquivos',
  pontos: arquivos.map((a) => ({
    id: a.id, tipo: 'arquivo', rotulo: a.nome.replace(/\.md$/, ''), destaque: false, vivo: true, link: null, ligacoes: [],
    resumo: `Relatório · modificado em ${a.modificado_em.toLocaleDateString('pt-BR')}`, texto: a.texto,
  })),
});

export function rotasCerebro({ db, hoje }) {
  const r = Router();

  r.get('/cerebro/projetos', (req, res) => {
    gerarTodasMensalidades(db, hoje());
    res.json(montarRelatorioProjetos(db, hoje()));
  });

  r.get('/cerebro', (req, res) => {
    gerarTodasMensalidades(db, hoje());
    const pasta = lerPasta(obterConfig(db, 'cerebro_path') || null);
    const memoria = montarMemoria(db, hoje());
    res.json({
      centro: pasta.centro,
      skills: pasta.skills,
      rotinas: pasta.rotinas,
      apps: pasta.apps_base.map((a) => ({
        ...a, conectado: Boolean(typeof a.conexao === 'string' && a.conexao.startsWith('crm:') && obterConfig(db, a.conexao.slice(4))),
      })),
      memoria: { ...memoria, areas: [...memoria.areas, areaArquivos(pasta.arquivos)] },
      pede_atencao: pedeAtencao(montarRelatorioProjetos(db, hoje()).pede_acao),
      avisos: pasta.avisos,
    });
  });

  return r;
}
