import { api } from '../api/client.js';
import { useCarregar } from './useCarregar.js';

export function useParcelas(projeto) {
  const { dados, recarregar } = useCarregar(
    () => api(`/projetos/${projeto.id}/parcelas`), [projeto.id, projeto.atualizado_em],
  );
  return { parcelas: dados?.parcelas ?? null, recarregar };
}

export function parcelaUnica(parcelas) {
  const avulsas = (parcelas ?? []).filter((p) => !p.mensalidade);
  return avulsas.length === 1 ? avulsas[0] : null;
}
