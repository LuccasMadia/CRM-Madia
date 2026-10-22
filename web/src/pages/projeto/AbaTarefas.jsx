import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useFormulario } from '../../hooks/useFormulario.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { Campo } from '../../components/Campo.jsx';
import { Aviso } from '../../components/Aviso.jsx';
import { Carregando } from '../../components/Carregando.jsx';
import { QuadroTarefas } from '../../components/QuadroTarefas.jsx';

export function AbaTarefas({ projetoId }) {
  const { dados: tarefas, erro, recarregar } = useCarregar(() => api(`/projetos/${projetoId}/tarefas`), [projetoId]);
  const { valores, campo, setValores } = useFormulario({ texto: '', prazo: '' });
  const envio = useEnvio();

  function adicionar(e) {
    e.preventDefault();
    envio.executar(async () => {
      await api(`/projetos/${projetoId}/tarefas`, { method: 'POST', body: valores });
      setValores({ texto: '', prazo: '' });
      recarregar();
    });
  }

  if (erro) return <Aviso erro={erro} />;
  if (!tarefas) return <Carregando />;

  return (
    <div className="tarefas">
      {tarefas.length ? <QuadroTarefas tarefas={tarefas} onMudou={recarregar} /> : <p className="vazio">Nenhuma tarefa ainda.</p>}

      <form onSubmit={adicionar} className="form form--linha cartao" noValidate>
        <Campo rotulo="Nova tarefa" nome="texto" erros={envio.erros} {...campo('texto')} />
        <Campo rotulo="Prazo" nome="prazo" erros={envio.erros} type="date" {...campo('prazo')} />
        <button className="btn btn--primario" disabled={envio.enviando}>Adicionar</button>
      </form>
      <Aviso erro={envio.erro} />
    </div>
  );
}
