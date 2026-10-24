import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useTarefaAberta } from '../../hooks/useTarefaAberta.js';
import { Aviso } from '../../components/Aviso.jsx';
import { Carregando } from '../../components/Carregando.jsx';
import { QuadroTarefas } from '../../components/QuadroTarefas.jsx';
import { PainelTarefa } from '../../components/tarefas/PainelTarefa.jsx';
import { BarraNovaTarefa } from '../../components/tarefas/BarraNovaTarefa.jsx';

export function AbaTarefas({ projetoId }) {
  const { dados: tarefas, erro, recarregar } = useCarregar(() => api(`/projetos/${projetoId}/tarefas`), [projetoId]);
  const painel = useTarefaAberta();

  if (erro) return <Aviso erro={erro} />;
  if (!tarefas) return <Carregando />;

  return (
    <div className="tarefas">
      <BarraNovaTarefa projetoId={projetoId} onCriada={recarregar} onAbrir={(t) => painel.abrir(t.id)} />
      {tarefas.length
        ? <QuadroTarefas tarefas={tarefas} onMudou={recarregar} onAbrir={(t) => painel.abrir(t.id)} />
        : <p className="vazio">Nenhuma tarefa ainda.</p>}
      {painel.aberta && <PainelTarefa id={painel.aberta} onFechar={painel.fechar} onMudou={recarregar} />}
    </div>
  );
}
