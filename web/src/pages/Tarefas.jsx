import { useSearchParams } from 'react-router';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { useTarefaAberta } from '../hooks/useTarefaAberta.js';
import { Aviso } from '../components/Aviso.jsx';
import { Carregando } from '../components/Carregando.jsx';
import { Icone } from '../components/Icone.jsx';
import { PedeAtencao } from '../components/PedeAtencao.jsx';
import { QuadroTarefas } from '../components/QuadroTarefas.jsx';
import { PainelTarefa } from '../components/tarefas/PainelTarefa.jsx';
import { BarraNovaTarefa } from '../components/tarefas/BarraNovaTarefa.jsx';
import { ListaTarefas } from '../components/tarefas/ListaTarefas.jsx';
import { hojeISO } from '../lib/datas.js';
import { FOCOS, PRIORIDADES, ROTULO_PRIORIDADE, TIPOS, TIPOS_TAREFA, itensAtencaoTarefas } from '../lib/tarefas.js';

const CHAVE_VISAO = 'crm.tarefasVisao';
const VISOES = [['quadro', 'Quadro'], ['lista', 'Lista']];
const lerVisao = (v) => (VISOES.some(([chave]) => chave === v) ? v : null);
function visaoSalva() {
  try {
    return lerVisao(localStorage.getItem(CHAVE_VISAO)) ?? 'quadro';
  } catch {
    return 'quadro';
  }
}

// Filtros que viram consulta no servidor; ficam no endereço junto com a visão, o foco e a tarefa aberta.
const FILTROS = [['cliente', 'cliente_id'], ['tipo', 'tipo'], ['prioridade', 'prioridade'], ['projeto', 'projeto_id']];
const TIPOS_PILULA = TIPOS.filter((t) => t !== 'interno');

// Tarefas de todos os projetos e as sem projeto, em quadro ou em lista por prazo.
export function Tarefas() {
  const [params, setParams] = useSearchParams();
  const painel = useTarefaAberta();
  const visao = lerVisao(params.get('ver')) ?? visaoSalva();
  const foco = FOCOS[params.get('foco')] ? params.get('foco') : null;
  const filtro = Object.fromEntries(FILTROS.map(([p]) => [p, params.get(p) ?? '']));
  const consulta = new URLSearchParams(FILTROS.filter(([p]) => filtro[p]).map(([p, q]) => [q, filtro[p]])).toString();

  const clientes = useCarregar(() => api('/clientes'), []);
  const tarefas = useCarregar(() => api(`/tarefas${consulta ? `?${consulta}` : ''}`), [consulta]);
  const hoje = hojeISO();
  const visiveis = tarefas.dados && (foco ? tarefas.dados.filter((t) => FOCOS[foco].filtro(t, hoje)) : tarefas.dados);
  const filtrando = Boolean(consulta || foco);

  // Muda só os parâmetros pedidos e mantém o resto (visão, tarefa aberta...).
  function mudar(mudancas) {
    setParams((atual) => {
      const novo = new URLSearchParams(atual);
      for (const [chave, valor] of Object.entries(mudancas)) {
        if (valor) novo.set(chave, valor);
        else novo.delete(chave);
      }
      return novo;
    });
  }
  const alternar = (chave, valor) => mudar({ [chave]: filtro[chave] === valor ? '' : valor });

  function trocarVisao(nova) {
    try {
      localStorage.setItem(CHAVE_VISAO, nova);
    } catch {
      // sem armazenamento: a escolha vale só nesta visita
    }
    mudar({ ver: nova });
  }

  const erro = clientes.erro ?? tarefas.erro;

  return (
    <section className="tarefas">
      <header className="pagina__topo"><h1>Tarefas</h1></header>
      <PedeAtencao itens={tarefas.dados ? itensAtencaoTarefas(tarefas.dados, hoje) : null} />

      <BarraNovaTarefa
        clientes={clientes.dados ?? []}
        padrao={{ cliente_id: filtro.cliente, tipo: filtro.tipo, projeto_id: filtro.projeto }}
        onCriada={tarefas.recarregar}
        onAbrir={(t) => painel.abrir(t.id)}
      />

      <div className="barra-visao barra-visao--tarefas">
        <div className="segmentado" role="group" aria-label="Visão">
          {VISOES.map(([chave, rotulo]) => (
            <button key={chave} type="button" aria-pressed={visao === chave} onClick={() => trocarVisao(chave)}>{rotulo}</button>
          ))}
        </div>
        <select className="select-compacto" aria-label="Filtrar por empresa" value={filtro.cliente} onChange={(e) => mudar({ cliente: e.target.value })}>
          <option value="">Todas as empresas</option>
          {(clientes.dados ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <div className="pilulas" role="group" aria-label="Tipo">
          {TIPOS_PILULA.map((t) => (
            <button key={t} type="button" className="pilula pilula--icone" aria-pressed={filtro.tipo === t} onClick={() => alternar('tipo', t)}>
              <Icone nome={TIPOS_TAREFA[t].icone} tamanho={15} />{TIPOS_TAREFA[t].rotulo}
            </button>
          ))}
          <button type="button" className="pilula pilula--icone" aria-pressed={filtro.tipo === 'interno'} onClick={() => alternar('tipo', 'interno')}>
            <Icone nome={TIPOS_TAREFA.interno.icone} tamanho={15} />Internas
          </button>
        </div>
        <div className="pilulas" role="group" aria-label="Prioridade">
          {PRIORIDADES.filter((p) => p !== 'normal').map((p) => (
            <button key={p} type="button" className={`pilula pilula--${p}`} aria-pressed={filtro.prioridade === p} onClick={() => alternar('prioridade', p)}>
              {ROTULO_PRIORIDADE[p]}
            </button>
          ))}
        </div>
      </div>

      {filtrando && (
        <p className="filtro-ativo">
          {foco ? `Mostrando: ${FOCOS[foco].rotulo.toLowerCase()}` : 'Com filtro'}
          {filtro.projeto && ' · um projeto'}
          <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => mudar({ cliente: '', tipo: '', prioridade: '', projeto: '', foco: '' })}>
            Limpar filtros
          </button>
        </p>
      )}

      <Aviso erro={erro} />
      {!visiveis ? (!erro && <Carregando />) : visiveis.length ? (
        visao === 'lista'
          ? <ListaTarefas tarefas={visiveis} onMudou={tarefas.recarregar} onAbrir={(t) => painel.abrir(t.id)} />
          : <QuadroTarefas tarefas={visiveis} onMudou={tarefas.recarregar} onAbrir={(t) => painel.abrir(t.id)} mostrarProjeto={!filtro.projeto} recolherConcluidas />
      ) : <p className="vazio">{filtrando ? 'Nenhuma tarefa com esse filtro.' : 'Nenhuma tarefa por aqui.'}</p>}

      {painel.aberta && <PainelTarefa id={painel.aberta} onFechar={painel.fechar} onMudou={tarefas.recarregar} />}
    </section>
  );
}
