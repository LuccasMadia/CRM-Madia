import { useSearchParams } from 'react-router';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { useFormulario } from '../hooks/useFormulario.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Campo } from '../components/Campo.jsx';
import { Aviso } from '../components/Aviso.jsx';
import { Carregando } from '../components/Carregando.jsx';
import { QuadroTarefas } from '../components/QuadroTarefas.jsx';
import { PainelTarefa } from '../components/tarefas/PainelTarefa.jsx';
import { useTarefaAberta } from '../hooks/useTarefaAberta.js';
import { notificar } from '../lib/notificacoes.js';

const SEM_PROJETO = 'nenhum';
const URL_DO_FILTRO = (filtro) =>
  filtro === SEM_PROJETO ? '/tarefas?sem_projeto=1' : filtro ? `/tarefas?projeto_id=${filtro}` : '/tarefas';

// Quadro com as tarefas de todos os projetos e as internas (sem projeto).
// O filtro fica no endereço: ?projeto=ID ou ?projeto=nenhum.
export function Tarefas() {
  const [params, setParams] = useSearchParams();
  const filtro = params.get('projeto') ?? '';
  const projetos = useCarregar(() => api('/projetos'), []);
  const tarefas = useCarregar(() => api(URL_DO_FILTRO(filtro)), [filtro]);
  // projeto_id null = segue o filtro; '' = escolheu "Sem projeto".
  const { valores, campo, setValores } = useFormulario({ projeto_id: null, texto: '', prazo: '' });
  const envio = useEnvio();
  const painel = useTarefaAberta();

  const abertos = (projetos.dados ?? []).filter((p) => p.etapa !== 'perdido');
  const projetoDaNova = valores.projeto_id ?? (filtro === SEM_PROJETO ? '' : filtro);

  function filtrar(e) {
    setParams(e.target.value ? { projeto: e.target.value } : {});
  }

  function adicionar(e) {
    e.preventDefault();
    envio.executar(async () => {
      const destino = projetoDaNova ? `/projetos/${projetoDaNova}/tarefas` : '/tarefas';
      await api(destino, { method: 'POST', body: { texto: valores.texto, prazo: valores.prazo } });
      setValores((v) => ({ ...v, texto: '', prazo: '' }));
      notificar(projetoDaNova ? 'Tarefa adicionada em A fazer.' : 'Tarefa interna adicionada em A fazer.');
      tarefas.recarregar();
    });
  }

  const erro = projetos.erro ?? tarefas.erro;

  return (
    <section className="tarefas">
      <header className="pagina__topo">
        <h1>Tarefas</h1>
        <div className="campo tarefas__filtro">
          <label htmlFor="filtro-projeto">Projeto</label>
          <select id="filtro-projeto" value={filtro} onChange={filtrar}>
            <option value="">Todos os projetos</option>
            <option value={SEM_PROJETO}>Sem projeto (internas)</option>
            {abertos.map((p) => <option key={p.id} value={p.id}>{p.titulo}</option>)}
          </select>
        </div>
      </header>

      <Aviso erro={erro} />
      {!tarefas.dados ? (!erro && <Carregando />) : tarefas.dados.length ? (
        <QuadroTarefas tarefas={tarefas.dados} onMudou={tarefas.recarregar} onAbrir={(t) => painel.abrir(t.id)} mostrarProjeto={!filtro} recolherConcluidas />
      ) : <p className="vazio">Nenhuma tarefa por aqui.</p>}

      <form onSubmit={adicionar} className="form form--linha cartao" noValidate>
        <Campo rotulo="Projeto" nome="projeto_id" erros={envio.erros}>
          <select {...campo('projeto_id')} value={projetoDaNova}>
            <option value="">Sem projeto (interna)</option>
            {abertos.map((p) => <option key={p.id} value={p.id}>{p.titulo}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Nova tarefa" nome="texto" erros={envio.erros} {...campo('texto')} />
        <Campo rotulo="Prazo" nome="prazo" erros={envio.erros} type="date" {...campo('prazo')} />
        <button className="btn btn--primario" disabled={envio.enviando}>Adicionar</button>
      </form>
      <Aviso erro={envio.erro} />
      {painel.aberta && <PainelTarefa id={painel.aberta} onFechar={painel.fechar} onMudou={tarefas.recarregar} />}
    </section>
  );
}
