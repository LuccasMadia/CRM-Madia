import { useSearchParams } from 'react-router';

// A tarefa aberta no painel lateral fica no endereço (?tarefa=ID): voltar, recarregar e mandar o link
// abrem no mesmo lugar. Os outros parâmetros (aba, filtros) continuam como estão.
export function useTarefaAberta() {
  const [params, setParams] = useSearchParams();
  const aberta = Number(params.get('tarefa')) || null;
  const mudar = (id) => setParams((atual) => {
    const novo = new URLSearchParams(atual);
    if (id) novo.set('tarefa', String(id));
    else novo.delete('tarefa');
    return novo;
  });
  return { aberta, abrir: (id) => mudar(id), fechar: () => mudar(null) };
}
