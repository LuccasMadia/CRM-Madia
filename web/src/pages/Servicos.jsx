import { useSearchParams } from 'react-router';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { Icone } from '../components/Icone.jsx';
import { SitesSistemas } from './servicos/SitesSistemas.jsx';
import { GoogleMeuNegocio } from './servicos/GoogleMeuNegocio.jsx';
import { PlacasNfc } from './servicos/PlacasNfc.jsx';

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

// Cada card mostra o que ainda pede atenção naquele serviço.
const SERVICOS = [
  {
    aba: 'sites', nome: 'Sites e Sistemas', icone: 'site', servico: 'site_sistema',
    contar: (p) => p.etapa === 'andamento', numero: (n) => `${n} em andamento`,
  },
  {
    aba: 'gmn', nome: 'Google Meu Negócio', icone: 'gmn', servico: 'google_meu_negocio',
    contar: (p) => p.etapa !== 'entregue', numero: (n) => plural(n, 'pendente', 'pendentes'),
  },
  {
    aba: 'placas', nome: 'Placas NFC', icone: 'nfc', servico: 'placas_nfc',
    contar: (p) => p.etapa !== 'entregue', numero: (n) => `${n} a entregar`,
  },
];

export function Servicos() {
  const [params, setParams] = useSearchParams();
  const aba = SERVICOS.some((s) => s.aba === params.get('aba')) ? params.get('aba') : 'sites';
  const { dados: projetos } = useCarregar(() => api('/projetos'), []);

  return (
    <section>
      <header className="pagina__topo">
        <h1>Serviços</h1>
      </header>
      <div role="tablist" className="cards-servico">
        {SERVICOS.map((s) => (
          <button
            key={s.aba} role="tab" type="button" className="card-servico" aria-selected={aba === s.aba}
            onClick={() => setParams({ aba: s.aba })}
          >
            <span className="card-servico__icone"><Icone nome={s.icone} tamanho={22} /></span>
            <span className="card-servico__nome">{s.nome}</span>
            <span className="card-servico__numero">
              {projetos && s.numero(projetos.filter((p) => p.servico === s.servico && s.contar(p)).length)}
            </span>
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {aba === 'sites' && <SitesSistemas />}
        {aba === 'gmn' && <GoogleMeuNegocio />}
        {aba === 'placas' && <PlacasNfc />}
      </div>
    </section>
  );
}
