import { useSearchParams } from 'react-router';
import { SitesSistemas } from './servicos/SitesSistemas.jsx';
import { GoogleMeuNegocio } from './servicos/GoogleMeuNegocio.jsx';
import { PlacasNfc } from './servicos/PlacasNfc.jsx';

const ABAS = [
  ['sites', 'Sites e Sistemas'],
  ['gmn', 'Google Meu Negócio'],
  ['placas', 'Placas NFC'],
];

export function Servicos() {
  const [params, setParams] = useSearchParams();
  const aba = ABAS.some(([chave]) => chave === params.get('aba')) ? params.get('aba') : 'sites';

  return (
    <section>
      <header className="pagina__topo">
        <h1>Serviços</h1>
      </header>
      <div role="tablist" className="abas">
        {ABAS.map(([chave, rotulo]) => (
          <button
            key={chave} role="tab" type="button" className="abas__aba" aria-selected={aba === chave}
            onClick={() => setParams({ aba: chave })}
          >
            {rotulo}
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
