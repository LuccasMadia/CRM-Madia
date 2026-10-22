import { useSyncExternalStore } from 'react';

// Quantas chamadas à API estão em andamento: alimenta a barra de carregamento do topo.
const ouvintes = new Set();
let pendentes = 0;

function mudar(delta) {
  pendentes += delta;
  ouvintes.forEach((avisar) => avisar());
}

export async function comAtividade(promessa) {
  mudar(1);
  try {
    return await promessa;
  } finally {
    mudar(-1);
  }
}

function assinar(avisar) {
  ouvintes.add(avisar);
  return () => ouvintes.delete(avisar);
}

export const useCarregandoAlgo = () => useSyncExternalStore(assinar, () => pendentes > 0);
