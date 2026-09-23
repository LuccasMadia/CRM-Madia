import { useState } from 'react';

export function useEnvio() {
  const [erros, setErros] = useState([]);
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);

  async function executar(fn) {
    setErros([]);
    setErro(null);
    setEnviando(true);
    try {
      return await fn();
    } catch (e) {
      setErros(e.erros ?? []);
      setErro(e);
      return undefined;
    } finally {
      setEnviando(false);
    }
  }

  return { erros, erro, enviando, executar, setErros };
}
