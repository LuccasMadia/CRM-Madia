import { useState } from 'react';
import { api } from '../../api/client.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { Aviso } from '../Aviso.jsx';
import { Icone } from '../Icone.jsx';
import { notificar } from '../../lib/notificacoes.js';
import { TIPOS, TIPOS_TAREFA } from '../../lib/tarefas.js';

// "+ Nova tarefa" no topo: digita o título e Enter cria. Empresa, tipo e prazo são opcionais e
// começam pelo filtro ativo (padrao). Com projetoId, a tarefa nasce no projeto (empresa e tipo vêm dele).
export function BarraNovaTarefa({ projetoId = null, clientes = null, padrao = {}, onCriada, onAbrir }) {
  const [texto, setTexto] = useState('');
  const [escolhas, setEscolhas] = useState({});
  const [criada, setCriada] = useState(null);
  const envio = useEnvio();
  // O que o Lucca escolheu na barra vale; o resto segue o filtro.
  const valor = (campo) => escolhas[campo] ?? padrao[campo] ?? '';
  const escolher = (campo) => (e) => setEscolhas((v) => ({ ...v, [campo]: e.target.value }));

  function criar(e) {
    e.preventDefault();
    if (!texto.trim()) return;
    envio.executar(async () => {
      const corpo = { texto };
      if (valor('prazo')) corpo.prazo = valor('prazo');
      if (!projetoId && valor('cliente_id')) corpo.cliente_id = Number(valor('cliente_id'));
      if (valor('tipo')) corpo.tipo = valor('tipo');
      const destino = projetoId ? `/projetos/${projetoId}/tarefas` : padrao.projeto_id ? `/projetos/${padrao.projeto_id}/tarefas` : '/tarefas';
      const nova = await api(destino, { method: 'POST', body: corpo });
      setTexto('');
      setEscolhas((v) => ({ ...v, prazo: '' }));
      setCriada(nova);
      notificar('Tarefa criada em A fazer.');
      onCriada?.(nova);
    });
  }

  return (
    <div className="nova-tarefa">
      <form className="nova-tarefa__barra" onSubmit={criar} noValidate>
        <span className="nova-tarefa__mais" aria-hidden="true">+</span>
        <input className="nova-tarefa__titulo" aria-label="Nova tarefa" placeholder="Nova tarefa… (Enter cria)" value={texto}
          onChange={(e) => setTexto(e.target.value)} aria-invalid={envio.erros.some((x) => x.campo === 'texto')} />
        {clientes && !projetoId && !padrao.projeto_id && (
          <select className="select-compacto" aria-label="Empresa da nova tarefa" value={valor('cliente_id')} onChange={escolher('cliente_id')}>
            <option value="">Sem empresa</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        )}
        <select className="select-compacto" aria-label="Tipo da nova tarefa" value={valor('tipo')} onChange={escolher('tipo')}>
          <option value="">{projetoId || padrao.projeto_id ? 'Tipo do projeto' : 'Tipo: interno'}</option>
          {TIPOS.map((t) => <option key={t} value={t}>{TIPOS_TAREFA[t].rotulo}</option>)}
        </select>
        <input type="date" className="select-compacto" aria-label="Prazo da nova tarefa" value={valor('prazo')} onChange={escolher('prazo')} />
        <button className="btn btn--primario btn--pequeno" disabled={envio.enviando || !texto.trim()}>Criar</button>
      </form>
      <Aviso erro={envio.erro} />
      {criada && (
        <p className="nova-tarefa__criada" role="status">
          <Icone nome="check" tamanho={16} /> {`"${criada.texto}" criada.`}
          {onAbrir && <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => { onAbrir(criada); setCriada(null); }}>Abrir para detalhar</button>}
        </p>
      )}
    </div>
  );
}
