import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { Aviso } from '../../components/Aviso.jsx';
import { formatarDinheiro } from '../../lib/dinheiro.js';
import { ROTULO_ETAPA } from '../../lib/rotulos.js';
import { AbaGeral } from './AbaGeral.jsx';
import { AbaTarefas } from './AbaTarefas.jsx';
import { AbaFinanceiro } from './AbaFinanceiro.jsx';
import { AbaPortfolio } from './AbaPortfolio.jsx';
import { AbaConteudos } from './AbaConteudos.jsx';

const ABAS = [
  ['geral', 'Visão geral'],
  ['tarefas', 'Tarefas'],
  ['financeiro', 'Financeiro'],
  ['portfolio', 'Portfólio'],
  ['conteudos', 'Conteúdos'],
];

export function Projeto() {
  const { id } = useParams();
  const [aba, setAba] = useState('geral');
  const { dados: projeto, erro, recarregar } = useCarregar(() => api(`/projetos/${id}`), [id]);

  if (erro) return <Aviso erro={erro} />;
  if (!projeto) return <p>Carregando…</p>;

  return (
    <section>
      <header className="pagina__topo">
        <div>
          <p className="sobretitulo"><Link to={`/clientes/${projeto.cliente_id}`}>{projeto.cliente_nome}</Link></p>
          <h1>{projeto.titulo}</h1>
        </div>
        <div>
          <span className={`etiqueta etiqueta--${projeto.etapa}`}>{ROTULO_ETAPA[projeto.etapa]}</span>{' '}
          <strong>{formatarDinheiro(projeto.valor_total_centavos)}</strong>
        </div>
      </header>
      <div role="tablist" className="abas">
        {ABAS.map(([chave, rotulo]) => (
          <button key={chave} role="tab" type="button" className="abas__aba" aria-selected={aba === chave} onClick={() => setAba(chave)}>
            {rotulo}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {aba === 'geral' && <AbaGeral key={projeto.atualizado_em} projeto={projeto} onSalvo={recarregar} />}
        {aba === 'tarefas' && <AbaTarefas projetoId={projeto.id} />}
        {aba === 'financeiro' && <AbaFinanceiro projeto={projeto} />}
        {aba === 'portfolio' && <AbaPortfolio projeto={projeto} />}
        {aba === 'conteudos' && <AbaConteudos projetoId={projeto.id} />}
      </div>
    </section>
  );
}
