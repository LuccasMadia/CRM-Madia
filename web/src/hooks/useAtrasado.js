import { useEffect, useState } from 'react';

// Devolve o valor só depois de ele ficar parado por `ms`: a busca não dispara a cada tecla.
export function useAtrasado(valor, ms = 250) {
  const [atrasado, setAtrasado] = useState(valor);
  useEffect(() => {
    const espera = setTimeout(() => setAtrasado(valor), ms);
    return () => clearTimeout(espera);
  }, [valor, ms]);
  return atrasado;
}
