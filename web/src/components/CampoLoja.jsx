import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { Campo } from './Campo.jsx';

// Loja do cliente (perfil do Google, placas). Só aparece quando o cliente tem lojas; '' = sem loja.
export function CampoLoja({ clienteId, value, onChange, erros }) {
  const { dados: cliente } = useCarregar(() => (clienteId ? api(`/clientes/${clienteId}`) : Promise.resolve(null)), [clienteId]);
  const lojas = cliente?.lojas ?? [];
  if (!lojas.length) return null;
  return (
    <Campo rotulo="Loja" nome="loja_id" erros={erros}>
      <select value={value} onChange={onChange}>
        <option value="">Sem loja</option>
        {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
      </select>
    </Campo>
  );
}
