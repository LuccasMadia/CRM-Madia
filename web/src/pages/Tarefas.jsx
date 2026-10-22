import { useSearchParams } from 'react-router';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { useFormulario } from '../hooks/useFormulario.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Campo } from '../components/Campo.jsx';
import { Aviso } from '../components/Aviso.jsx';
import { Carregando } from '../components/Carregando.jsx';
import { QuadroTarefas } from '../components/QuadroTarefas.jsx';
import { notificar } from '../lib/notificacoes.js';

// Quadro com as tarefas de todos os projetos; o filtro fica no endereço (?projeto=ID).
export function Tarefas() {
  const [params, setParams] = useSearchParams();
  const filtro = params.get('projeto') ?? '';
  const projetos = useCarregar(() => api('/projetos'), []);
  const tarefas = useCarregar(() => api(filtro ? `/tarefas?projeto_id=${filtro}` : '/tarefas'), [filtro]);
  const { valores, campo, setValores } = useFormulario({ projeto_id: '', texto: '', prazo: '' });
  const envio = useEnvio();

  const abertos = (projetos.dados ?? []).filter((p) => p.etapa !== 'perdido');
  const projetoDaNova = valores.projeto_id || filtro;

  function filtrar(e) {
    setParams(e.target.value ? { projeto: e.target.value } : {});
  }

  function adicionar(e) {
    e.preventDefault();
    if (!projetoDaNova) {
      envio.setErros([{ campo: 'projeto_id', mensagem: 'Escolha o projeto' }]);
      return;
    }
    envio.executar(async () => {
      await api(`/projetos/${projetoDaNova}/tarefas`, { method: 'POST', body: { texto: valores.texto, prazo: valores.prazo } });
      setValores((v) => ({ ...v, texto: '', prazo: '' }));
      notificar('Tarefa adicionada em A fazer.');
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
            {abertos.map((p) => <option key={p.id} value={p.id}>{p.titulo}</option>)}
          </select>
        </div>
      </header>

      <Aviso erro={erro} />
      {!tarefas.dados ? (!erro && <Carregando />) : tarefas.dados.length ? (
        <QuadroTarefas tarefas={tarefas.dados} onMudou={tarefas.recarregar} mostrarProjeto={!filtro} recolherConcluidas />
      ) : <p className="vazio">Nenhuma tarefa por aqui.</p>}

      <form onSubmit={adicionar} className="form form--linha cartao" noValidate>
        <Campo rotulo="Projeto" nome="projeto_id" erros={envio.erros}>
          <select {...campo('projeto_id')} value={projetoDaNova}>
            <option value="">Escolha…</option>
            {abertos.map((p) => <option key={p.id} value={p.id}>{p.titulo}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Nova tarefa" nome="texto" erros={envio.erros} {...campo('texto')} />
        <Campo rotulo="Prazo" nome="prazo" erros={envio.erros} type="date" {...campo('prazo')} />
        <button className="btn btn--primario" disabled={envio.enviando}>Adicionar</button>
      </form>
      <Aviso erro={envio.erro} />
    </section>
  );
}
