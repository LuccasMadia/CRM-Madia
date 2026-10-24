import { useState } from 'react';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useTarefaAberta } from '../../hooks/useTarefaAberta.js';
import { Aviso } from '../../components/Aviso.jsx';
import { Carregando } from '../../components/Carregando.jsx';
import { QuadroTarefas } from '../../components/QuadroTarefas.jsx';
import { PainelTarefa } from '../../components/tarefas/PainelTarefa.jsx';
import { BarraNovaTarefa } from '../../components/tarefas/BarraNovaTarefa.jsx';
import { AplicarModelo } from '../../components/tarefas/ModeloTarefas.jsx';

export function AbaTarefas({ projetoId, servico = 'site_sistema' }) {
  const { dados: tarefas, erro, recarregar } = useCarregar(() => api(`/projetos/${projetoId}/tarefas`), [projetoId]);
  const painel = useTarefaAberta();
  const [aplicando, setAplicando] = useState(false);

  if (erro) return <Aviso erro={erro} />;
  if (!tarefas) return <Carregando />;

  return (
    <div className="tarefas">
      <div className="tarefas__topo-projeto">
        <BarraNovaTarefa projetoId={projetoId} onCriada={recarregar} onAbrir={(t) => painel.abrir(t.id)} />
        <button type="button" className="btn" onClick={() => setAplicando(true)}>Aplicar modelo</button>
      </div>
      {tarefas.length
        ? <QuadroTarefas tarefas={tarefas} onMudou={recarregar} onAbrir={(t) => painel.abrir(t.id)} />
        : <p className="vazio">Nenhuma tarefa ainda.</p>}
      {aplicando && <AplicarModelo projetoId={projetoId} servico={servico} onFechar={() => setAplicando(false)} onAplicado={recarregar} />}
      {painel.aberta && <PainelTarefa id={painel.aberta} onFechar={painel.fechar} onMudou={recarregar} />}
    </div>
  );
}
