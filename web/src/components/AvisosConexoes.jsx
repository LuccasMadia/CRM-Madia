import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { PedeAtencao } from './PedeAtencao.jsx';

// Faixa de tokens que pararam de funcionar ou estão perto de vencer; some quando não há nada a avisar.
export function AvisosConexoes() {
  const estado = useCarregar(() => api('/conexoes/atencao'), []);
  const alertas = estado.dados?.alertas ?? [];
  if (!alertas.length) return null;
  return (
    <div className="avisos-publicacao">
      <PedeAtencao itens={alertas} />
    </div>
  );
}
