import { useState } from 'react';

export function useFormulario(inicial) {
  const [valores, setValores] = useState(inicial);
  const campo = (nome) => ({
    name: nome,
    value: valores[nome] ?? '',
    onChange: (e) => setValores((v) => ({ ...v, [nome]: e.target.value })),
  });
  return { valores, setValores, campo };
}
