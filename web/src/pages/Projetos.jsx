import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { Aviso } from '../components/Aviso.jsx';
import { formatarDinheiro } from '../lib/dinheiro.js';
import { ETAPAS, ROTULO_ETAPA } from '../lib/rotulos.js';

export function Projetos() {
  const [etapa, setEtapa] = useState('');
  const [clienteId, setClienteId] = useState('');
  const consulta = new URLSearchParams(
    Object.entries({ etapa, cliente_id: clienteId }).filter(([, v]) => v),
  ).toString();

  const { dados: projetos, erro } = useCarregar(() => api(`/projetos${consulta ? `?${consulta}` : ''}`), [consulta]);
  const { dados: clientes } = useCarregar(() => api('/clientes'), []);

  const lista = (projetos ?? [])
    .filter((p) => etapa || p.etapa !== 'perdido')
    .slice()
    .sort((a, b) => b.atualizado_em.localeCompare(a.atualizado_em));

  return (
    <section>
      <header className="pagina__topo">
        <h1>Projetos</h1>
        <div className="form--linha">
          <label className="campo">
            <span>Etapa</span>
            <select aria-label="Etapa" value={etapa} onChange={(e) => setEtapa(e.target.value)}>
              <option value="">Ativos</option>
              {ETAPAS.map((e) => <option key={e} value={e}>{ROTULO_ETAPA[e]}</option>)}
            </select>
          </label>
          <label className="campo">
            <span>Cliente</span>
            <select aria-label="Cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Todos os clientes</option>
              {(clientes ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
        </div>
      </header>
      <Aviso erro={erro} />
      {projetos && (lista.length ? (
        <table className="tabela">
          <thead>
            <tr><th>Cliente</th><th>Título</th><th>Etapa</th><th className="num">Valor total</th></tr>
          </thead>
          <tbody>
            {lista.map((p) => (
              <tr key={p.id}>
                <td><Link to={`/clientes/${p.cliente_id}`}>{p.cliente_nome}</Link></td>
                <td><Link to={`/projetos/${p.id}`}>{p.titulo}</Link></td>
                <td><span className={`etiqueta etiqueta--${p.etapa}`}>{ROTULO_ETAPA[p.etapa]}</span></td>
                <td className="num">{formatarDinheiro(p.valor_total_centavos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="vazio">Nenhum projeto encontrado.</p>)}
    </section>
  );
}
