import { useState } from 'react';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { useConfirmacao } from '../../hooks/useConfirmacao.jsx';
import { Aviso } from '../../components/Aviso.jsx';
import { Icone } from '../../components/Icone.jsx';
import { notificar } from '../../lib/notificacoes.js';
import { TIPOS, TIPOS_TAREFA } from '../../lib/tarefas.js';

// dias_apos_inicio vem como texto do campo; vazio = sem prazo.
const lerDias = (texto) => (String(texto).trim() === '' ? null : Number(texto));

// Configurações › Modelos de tarefas: a sequência padrão de cada serviço, aplicada nos projetos.
export function ModelosTarefas() {
  const { dados: modelos, erro, recarregar } = useCarregar(() => api('/tarefas-modelos'), []);
  const [novo, setNovo] = useState({ nome: '', tipo: 'site_sistema' });
  const envio = useEnvio();
  const [confirmar, dialogo] = useConfirmacao();
  const acao = (fn) => envio.executar(async () => { await fn(); recarregar(); });

  function criar(e) {
    e.preventDefault();
    acao(async () => {
      await api('/tarefas-modelos', { method: 'POST', body: novo });
      setNovo((n) => ({ ...n, nome: '' }));
      notificar('Modelo criado');
    });
  }

  function excluir(m) {
    confirmar({
      titulo: `Excluir o modelo "${m.nome}"?`,
      mensagem: 'As tarefas já criadas a partir dele continuam nos projetos.',
      onConfirmar: async () => {
        await api(`/tarefas-modelos/${m.id}`, { method: 'DELETE' });
        notificar('Modelo excluído');
        recarregar();
      },
    });
  }

  return (
    <section className="cartao" aria-label="Modelos de tarefas">
      <h2>Modelos de tarefas</h2>
      <p className="explicacao">A sequência que se repete em cada serviço. Na aba Tarefas do projeto, “Aplicar modelo” cria as que ainda não existem; o prazo conta a partir do início do projeto.</p>
      <Aviso erro={erro ?? envio.erro} />
      <div className="modelos-tarefas">
        {(modelos ?? []).map((m) => <Modelo key={m.id} modelo={m} acao={acao} onExcluir={() => excluir(m)} />)}
      </div>
      <form onSubmit={criar} className="form--linha">
        <div className="campo">
          <label htmlFor="novo-modelo">Novo modelo</label>
          <input id="novo-modelo" value={novo.nome} onChange={(e) => setNovo((n) => ({ ...n, nome: e.target.value }))} />
        </div>
        <div className="campo">
          <label htmlFor="novo-modelo-tipo">Tipo</label>
          <select id="novo-modelo-tipo" value={novo.tipo} onChange={(e) => setNovo((n) => ({ ...n, tipo: e.target.value }))}>
            {TIPOS.map((t) => <option key={t} value={t}>{TIPOS_TAREFA[t].rotulo}</option>)}
          </select>
        </div>
        <button className="btn" disabled={envio.enviando || !novo.nome.trim()}>Criar modelo</button>
      </form>
      {dialogo}
    </section>
  );
}

function Modelo({ modelo: m, acao, onExcluir }) {
  const [nome, setNome] = useState(m.nome);
  const [item, setItem] = useState({ texto: '', dias: '' });

  function renomear() {
    if (nome.trim() && nome.trim() !== m.nome) acao(() => api(`/tarefas-modelos/${m.id}`, { method: 'PUT', body: { nome } }));
  }
  function adicionar(e) {
    e.preventDefault();
    if (!item.texto.trim()) return;
    acao(async () => {
      await api(`/tarefas-modelos/${m.id}/itens`, { method: 'POST', body: { texto: item.texto, dias_apos_inicio: lerDias(item.dias) } });
      setItem({ texto: '', dias: '' });
    });
  }
  function mover(i, j) {
    const ids = m.itens.map((x) => x.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    acao(() => api(`/tarefas-modelos/${m.id}/itens/ordem`, { method: 'PUT', body: { ids } }));
  }
  const salvarItem = (it, corpo) => acao(() => api(`/tarefas-modelos/itens/${it.id}`, { method: 'PUT', body: corpo }));

  return (
    <article className="modelo-tarefas" aria-label={`Modelo ${m.nome}`}>
      <header className="modelo-tarefas__topo">
        <span className="modelo-tarefas__tipo" title={TIPOS_TAREFA[m.tipo].rotulo}><Icone nome={TIPOS_TAREFA[m.tipo].icone} tamanho={18} /></span>
        <input className="modelo-tarefas__nome" aria-label={`Nome do modelo ${m.nome}`} value={nome} onChange={(e) => setNome(e.target.value)}
          onBlur={renomear} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
        <select className="select-compacto" aria-label={`Tipo do modelo ${m.nome}`} value={m.tipo}
          onChange={(e) => acao(() => api(`/tarefas-modelos/${m.id}`, { method: 'PUT', body: { tipo: e.target.value } }))}>
          {TIPOS.map((t) => <option key={t} value={t}>{TIPOS_TAREFA[t].rotulo}</option>)}
        </select>
        <button type="button" className="btn btn--pequeno btn--perigo" onClick={onExcluir}>Excluir</button>
      </header>
      <ol className="modelo-tarefas__itens">
        {m.itens.map((it, i) => (
          <li key={it.id} className="modelo-tarefas__item">
            <span className="modelo-tarefas__numero">{i + 1}</span>
            <input aria-label={`Texto do item ${i + 1}`} defaultValue={it.texto}
              onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== it.texto && salvarItem(it, { texto: e.target.value })} />
            <label className="modelo-tarefas__dias">
              <span>dia</span>
              <input type="number" min="0" aria-label={`Dias após o início do item ${i + 1}`} defaultValue={it.dias_apos_inicio ?? ''}
                onBlur={(e) => lerDias(e.target.value) !== it.dias_apos_inicio && salvarItem(it, { dias_apos_inicio: lerDias(e.target.value) })} />
            </label>
            <span className="modelo-tarefas__acoes">
              <button type="button" className="btn btn--icone" aria-label={`Subir ${it.texto}`} disabled={i === 0} onClick={() => mover(i, i - 1)}><Icone nome="seta-cima" tamanho={16} /></button>
              <button type="button" className="btn btn--icone" aria-label={`Descer ${it.texto}`} disabled={i === m.itens.length - 1} onClick={() => mover(i, i + 1)}><Icone nome="seta-baixo" tamanho={16} /></button>
              <button type="button" className="btn btn--icone btn--icone-perigo" aria-label={`Apagar ${it.texto}`}
                onClick={() => acao(() => api(`/tarefas-modelos/itens/${it.id}`, { method: 'DELETE' }))}><Icone nome="fechar" tamanho={16} /></button>
            </span>
          </li>
        ))}
      </ol>
      <form onSubmit={adicionar} className="modelo-tarefas__novo">
        <input aria-label={`Novo item do modelo ${m.nome}`} placeholder="Nova tarefa do modelo" value={item.texto} onChange={(e) => setItem((v) => ({ ...v, texto: e.target.value }))} />
        <input type="number" min="0" aria-label={`Dias após o início do novo item de ${m.nome}`} placeholder="dia" value={item.dias}
          onChange={(e) => setItem((v) => ({ ...v, dias: e.target.value }))} />
        <button className="btn btn--pequeno" disabled={!item.texto.trim()}>Adicionar</button>
      </form>
    </article>
  );
}
