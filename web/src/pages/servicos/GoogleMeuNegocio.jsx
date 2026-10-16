import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { Aviso } from '../../components/Aviso.jsx';
import { formatarDinheiro } from '../../lib/dinheiro.js';
import { formatarData } from '../../lib/datas.js';

const configurado = (p) => p.etapa === 'entregue';

// Editar, marcar configurado e cobrar continuam no perfil do cliente (aba GMN).
export function GoogleMeuNegocio() {
  const [situacao, setSituacao] = useState('');
  const { dados: projetos, erro } = useCarregar(() => api('/projetos?servico=google_meu_negocio'), []);

  const lista = (projetos ?? [])
    .filter((p) => !situacao || (situacao === 'configurado') === configurado(p))
    .slice()
    .sort((a, b) => b.atualizado_em.localeCompare(a.atualizado_em));

  return (
    <div>
      <header className="pagina__topo">
        <div className="form--linha">
          <label className="campo">
            <span>Situação</span>
            <select aria-label="Situação" value={situacao} onChange={(e) => setSituacao(e.target.value)}>
              <option value="">Todos</option>
              <option value="pendente">Pendentes</option>
              <option value="configurado">Configurados</option>
            </select>
          </label>
        </div>
      </header>
      <Aviso erro={erro} />
      {projetos && (lista.length ? (
        <table className="tabela">
          <thead>
            <tr><th>Cliente</th><th>Situação</th><th>Perfil</th><th className="num">Valor</th></tr>
          </thead>
          <tbody>
            {lista.map((p) => (
              <tr key={p.id}>
                <td><Link to={`/clientes/${p.cliente_id}?aba=gmn`}>{p.cliente_nome}</Link></td>
                <td>
                  {configurado(p)
                    ? <span className="etiqueta etiqueta--entregue">{`Configurado em ${formatarData(p.data_entrega)}`}</span>
                    : <span className="etiqueta etiqueta--andamento">Pendente</span>}
                </td>
                <td>{p.link_perfil ? <a href={p.link_perfil} target="_blank" rel="noreferrer">{p.link_perfil}</a> : '—'}</td>
                <td className="num">{formatarDinheiro(p.valor_total_centavos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="vazio">Nenhum Google Meu Negócio encontrado.</p>)}
    </div>
  );
}
