import { useSearchParams } from 'react-router';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { Icone } from '../components/Icone.jsx';
import { ETAPAS_EM_ANDAMENTO } from '../lib/rotulos.js';
import { SitesSistemas } from './servicos/SitesSistemas.jsx';
import { GoogleMeuNegocio } from './servicos/GoogleMeuNegocio.jsx';
import { PlacasNfc } from './servicos/PlacasNfc.jsx';

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

// Cada aba conta o que ainda pede atenção naquele serviço; o dinheiro fica na faixa de números de cada um.
const SERVICOS = [
  {
    aba: 'sites', nome: 'Sites e Sistemas', icone: 'site',
    contar: ({ projetos }) => projetos?.filter((p) => p.servico === 'site_sistema' && ETAPAS_EM_ANDAMENTO.includes(p.etapa)).length,
    rotulo: (n) => `${n} em andamento`,
  },
  {
    aba: 'gmn', nome: 'Google Meu Negócio', icone: 'gmn',
    contar: ({ projetos }) => projetos?.filter((p) => p.servico === 'google_meu_negocio' && p.etapa !== 'entregue').length,
    rotulo: (n) => plural(n, 'pendente', 'pendentes'),
  },
  {
    aba: 'placas', nome: 'Placas NFC', icone: 'nfc',
    contar: ({ resumo }) => resumo?.placas_nfc?.vendas_a_receber,
    rotulo: (n) => plural(n, 'venda a receber', 'vendas a receber'),
  },
];

export function Servicos() {
  const [params, setParams] = useSearchParams();
  const aba = SERVICOS.some((s) => s.aba === params.get('aba')) ? params.get('aba') : 'sites';
  const { dados: projetos } = useCarregar(() => api('/projetos'), []);
  const { dados: resumo } = useCarregar(() => api('/servicos/resumo'), []);

  return (
    <section>
      <header className="pagina__topo">
        <h1>Serviços</h1>
      </header>
      <div role="tablist" className="abas abas--servicos">
        {SERVICOS.map((s) => {
          const n = s.contar({ projetos, resumo });
          return (
            <button
              key={s.aba} role="tab" type="button" className="abas__aba" aria-selected={aba === s.aba}
              onClick={() => setParams({ aba: s.aba })}
            >
              <Icone nome={s.icone} tamanho={18} />
              <span className="abas__nome">{s.nome}</span>
              {n > 0 && <span className="contador" aria-label={s.rotulo(n)}>{n}</span>}
            </button>
          );
        })}
      </div>
      <div role="tabpanel">
        {aba === 'sites' && <SitesSistemas />}
        {aba === 'gmn' && <GoogleMeuNegocio />}
        {aba === 'placas' && <PlacasNfc />}
      </div>
    </section>
  );
}
