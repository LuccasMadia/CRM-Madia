import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { Aviso } from '../../components/Aviso.jsx';
import { Icone } from '../../components/Icone.jsx';
import { formatarDinheiro } from '../../lib/dinheiro.js';
import { ROTULO_ETAPA } from '../../lib/rotulos.js';

// Rótulos curtos só para as pílulas do filtro.
const FILTROS_ETAPA = [
  ['', 'Ativos'],
  ['contato', 'Contato'],
  ['proposta', 'Proposta'],
  ['andamento', 'Em andamento'],
  ['entregue', 'Entregue'],
  ['perdido', 'Perdidos'],
];

function Selo({ icone, rotulo }) {
  return <span className="selo-divulgacao" role="img" aria-label={rotulo} title={rotulo}><Icone nome={icone} tamanho={16} /></span>;
}

export function SitesSistemas() {
  const navegar = useNavigate();
  const [etapa, setEtapa] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [instagram, setInstagram] = useState('');
  const consulta = new URLSearchParams(
    Object.entries({ servico: 'site_sistema', etapa, cliente_id: clienteId, postou_instagram: instagram }).filter(([, v]) => v),
  ).toString();

  const { dados: projetos, erro } = useCarregar(() => api(`/projetos${consulta ? `?${consulta}` : ''}`), [consulta]);
  const { dados: clientes } = useCarregar(() => api('/clientes'), []);

  const lista = (projetos ?? [])
    .filter((p) => etapa || p.etapa !== 'perdido')
    .slice()
    .sort((a, b) => b.atualizado_em.localeCompare(a.atualizado_em));

  // A linha toda abre o projeto; cliques em links (título, cliente) seguem o próprio link.
  function abrirLinha(e, id) {
    if (e.target.closest('a')) return;
    navegar(`/projetos/${id}`);
  }

  return (
    <div>
      <div className="filtros">
        <div className="pilulas" role="group" aria-label="Etapa">
          {FILTROS_ETAPA.map(([valor, rotulo]) => (
            <button key={rotulo} type="button" className="pilula" aria-pressed={etapa === valor} onClick={() => setEtapa(valor)}>
              {rotulo}
            </button>
          ))}
        </div>
        <div className="filtros__selects">
          <select className="select-compacto" aria-label="Cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
            <option value="">Todos os clientes</option>
            {(clientes ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <select className="select-compacto" aria-label="Instagram" value={instagram} onChange={(e) => setInstagram(e.target.value)}>
            <option value="">Instagram: todos</option>
            <option value="1">Postaram</option>
            <option value="0">Não postaram</option>
          </select>
        </div>
      </div>
      <Aviso erro={erro} />
      {projetos && (lista.length ? (
        <table className="tabela tabela--limpa">
          <thead>
            <tr><th>Projeto</th><th>Etapa</th><th>Divulgação</th><th className="num">Valor</th></tr>
          </thead>
          <tbody>
            {lista.map((p) => (
              <tr key={p.id} className="tabela__linha--clicavel" onClick={(e) => abrirLinha(e, p.id)}>
                <td>
                  <Link className="tabela__titulo" to={`/projetos/${p.id}`}>{p.titulo}</Link>
                  <Link className="tabela__sub" to={`/clientes/${p.cliente_id}`}>{p.cliente_nome}</Link>
                </td>
                <td><span className={`etapa etapa--${p.etapa}`}>{ROTULO_ETAPA[p.etapa]}</span></td>
                <td>
                  {Boolean(p.postou_instagram) && <Selo icone="instagram" rotulo="Postou no Instagram" />}
                  {Boolean(p.no_portfolio) && <Selo icone="portfolio" rotulo="No portfólio" />}
                </td>
                <td className="num tabela__valor">{p.valor_total_centavos ? formatarDinheiro(p.valor_total_centavos) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="vazio">Nenhum projeto encontrado.</p>)}
    </div>
  );
}
