import { useEffect } from 'react';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { useFormulario } from '../hooks/useFormulario.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Campo } from './Campo.jsx';
import { Aviso } from './Aviso.jsx';
import { hojeISO } from '../lib/datas.js';
import { apenasAtivos } from '../lib/ativos.js';

export function FormPlacaMontagem({ onSalvar }) {
  const { dados: modelos } = useCarregar(() => api('/placas/modelos'), []);
  const { valores, campo, setValores } = useFormulario({ modelo_id: '', quantidade: '1', data_montagem: hojeISO() });
  const { erros, erro, enviando, executar } = useEnvio();
  const comReceita = apenasAtivos(modelos ?? [], valores.modelo_id).filter((m) => m.itens?.length);

  useEffect(() => {
    if (!valores.modelo_id && comReceita.length) setValores((v) => ({ ...v, modelo_id: String(comReceita[0].id) }));
  }, [comReceita, valores.modelo_id, setValores]);

  function enviar(e) {
    e.preventDefault();
    executar(() => onSalvar({
      modelo_id: valores.modelo_id ? Number(valores.modelo_id) : null,
      quantidade: Number(valores.quantidade) || null,
      data_montagem: valores.data_montagem,
    }));
  }

  return (
    <form onSubmit={enviar} className="form" noValidate>
      <Campo rotulo="Modelo" nome="modelo_id" erros={erros}>
        <select {...campo('modelo_id')}>
          <option value="">Selecione…</option>
          {comReceita.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Quantidade" nome="quantidade" erros={erros} type="number" min="1" {...campo('quantidade')} />
      <Campo rotulo="Data da montagem" nome="data_montagem" erros={erros} type="date" {...campo('data_montagem')} />
      <p className="vazio">Os materiais da receita do modelo saem do estoque solto.</p>
      <Aviso erro={erro} />
      <div><button className="btn btn--primario" disabled={enviando}>Registrar montagem</button></div>
    </form>
  );
}
