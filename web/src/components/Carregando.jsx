import { useEffect, useState } from 'react';
import { useCarregandoAlgo } from '../lib/atividade.js';

// Texto padrão para quando uma tela ainda não tem nada para mostrar.
export function Carregando({ texto = 'Carregando…' }) {
  return <p className="vazio carregando" role="status">{texto}</p>;
}

// Barra fina no topo enquanto alguma chamada à API está em andamento.
// Espera um instante antes de aparecer para não piscar em respostas rápidas.
const ATRASO = 250;

export function BarraCarregando() {
  const ativo = useCarregandoAlgo();
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    if (!ativo) {
      setVisivel(false);
      return undefined;
    }
    const espera = setTimeout(() => setVisivel(true), ATRASO);
    return () => clearTimeout(espera);
  }, [ativo]);

  return visivel ? <div className="barra-carregando" aria-hidden="true" /> : null;
}
