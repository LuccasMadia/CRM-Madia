import { useEffect } from 'react';
import { Link } from 'react-router';
import { Icone } from '../../components/Icone.jsx';
import { formatarData } from '../../lib/datas.js';

const TITULO = { centro: () => 'CLAUDE.md', ponto: (d) => d.rotulo, skill: (d) => d.nome, rotina: (d) => d.nome, app: (d) => d.nome };
const TIPO = { centro: 'Centro do cérebro', skill: 'Skill', rotina: 'Rotina', app: 'App' };

function Corpo({ tipo, dados }) {
  if (tipo === 'centro') return <pre className="cerebro-painel__texto">{dados.texto}</pre>;
  if (tipo === 'skill') return <p>{dados.descricao}</p>;
  if (tipo === 'ponto') {
    return (
      <>
        <p>{dados.resumo}</p>
        <Link className="btn btn--primario" to={dados.link}>Abrir no CRM</Link>
      </>
    );
  }
  const campos = tipo === 'rotina'
    ? [
      ['O que faz', dados.o_que_faz],
      ['Frequência', dados.frequencia],
      ['Estado', dados.estado === 'ativa' ? 'Ativa' : 'Planejada'],
      ['Última execução', dados.ultima_execucao ? formatarData(dados.ultima_execucao) : 'Ainda não rodou'],
    ]
    : [
      ['Para que serve', dados.para_que],
      ['Conexão', dados.conectado ? 'Conectado ao CRM' : 'Não conectado ao CRM'],
    ];
  return (
    <dl className="cerebro-painel__campos">
      {campos.map(([rotulo, valor]) => (
        <div key={rotulo}><dt>{rotulo}</dt><dd>{valor}</dd></div>
      ))}
    </dl>
  );
}

// Painel lateral do cérebro (folha de baixo no celular). Fecha com Esc ou com o ×.
export function PainelPonto({ item, onFechar }) {
  useEffect(() => {
    const teclar = (e) => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', teclar);
    return () => window.removeEventListener('keydown', teclar);
  }, [onFechar]);

  const titulo = TITULO[item.tipo](item.dados);
  return (
    <aside className="cerebro-painel" aria-label={titulo}>
      <header className="cerebro-painel__topo">
        <span className="cerebro-painel__tipo">{item.tipo === 'ponto' ? item.dados.area : TIPO[item.tipo]}</span>
        <button type="button" className="cerebro-painel__fechar" aria-label="Fechar" onClick={onFechar}>
          <Icone nome="fechar" />
        </button>
      </header>
      <h2>{titulo}</h2>
      <Corpo {...item} />
    </aside>
  );
}
