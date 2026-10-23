import { useSearchParams } from 'react-router';
import { ListaOrcamentos } from './orcamentos/ListaOrcamentos.jsx';
import { TabelaPrecos } from './orcamentos/TabelaPrecos.jsx';

// `explica` é a frase curta embaixo das abas: o que aquela aba mostra, sem termo técnico.
const ABAS = [
  { aba: 'orcamentos', nome: 'Orçamentos', explica: 'Todos os orçamentos de todos os clientes. Ao aceitar um, você confere e ele cria os projetos, as mensalidades e as vendas de placa.' },
  { aba: 'precos', nome: 'Tabela de preços', explica: 'Os serviços e pacotes que entram nos orçamentos, com o valor de partida de cada um.' },
];

export function Orcamentos() {
  const [params, setParams] = useSearchParams();
  const aba = ABAS.some((a) => a.aba === params.get('aba')) ? params.get('aba') : 'orcamentos';

  return (
    <section>
      <header className="pagina__topo">
        <h1>Orçamentos</h1>
      </header>
      <div role="tablist" className="abas">
        {ABAS.map((a) => (
          <button key={a.aba} role="tab" type="button" className="abas__aba" aria-selected={aba === a.aba} onClick={() => setParams({ aba: a.aba })}>
            {a.nome}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        <p className="explicacao">{ABAS.find((a) => a.aba === aba).explica}</p>
        {aba === 'orcamentos' && <ListaOrcamentos />}
        {aba === 'precos' && <TabelaPrecos />}
      </div>
    </section>
  );
}
