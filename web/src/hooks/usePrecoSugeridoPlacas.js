import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

export function usePrecoSugeridoPlacas({ modeloId, quantidade, clienteId, projetoId }) {
  const [sugerido, setSugerido] = useState(null);
  const valida = Boolean(modeloId) && Number.isInteger(quantidade) && quantidade >= 1;
  const chave = valida ? `${modeloId}|${quantidade}|${clienteId ?? ''}|${projetoId ?? ''}` : null;

  useEffect(() => {
    setSugerido(null);
    if (!chave) return undefined;
    let ativo = true;
    const params = new URLSearchParams({ quantidade: String(quantidade) });
    if (clienteId) params.set('cliente_id', String(clienteId));
    if (projetoId) params.set('projeto_id', String(projetoId));
    api(`/placas/modelos/${modeloId}/preco?${params}`).then((dados) => ativo && setSugerido(dados), () => {});
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  return sugerido;
}
