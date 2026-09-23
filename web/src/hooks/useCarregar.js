import { useEffect, useState } from 'react';

export function useCarregar(carregar, deps) {
  const [estado, setEstado] = useState({ dados: null, erro: null, carregando: true });
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let ativo = true;
    setEstado((e) => ({ ...e, carregando: true }));
    carregar().then(
      (dados) => ativo && setEstado({ dados, erro: null, carregando: false }),
      (erro) => ativo && setEstado({ dados: null, erro, carregando: false }),
    );
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, versao]);

  return { ...estado, recarregar: () => setVersao((v) => v + 1) };
}
