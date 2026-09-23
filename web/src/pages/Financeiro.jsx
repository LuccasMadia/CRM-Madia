import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { Aviso } from '../components/Aviso.jsx';
import { formatarDinheiro } from '../lib/dinheiro.js';
import { formatarData, hojeISO, nomeMes } from '../lib/datas.js';
import { ROTULO_ESTADO_PARCELA } from '../lib/rotulos.js';

export function Financeiro() {
  const [estado, setEstado] = useState('');
  const [mes, setMes] = useState('');
  const ano = hojeISO().slice(0, 4);
  const consulta = new URLSearchParams(Object.entries({ estado, mes }).filter(([, v]) => v)).toString();

  const { dados: parcelas, erro } = useCarregar(() => api(`/parcelas${consulta ? `?${consulta}` : ''}`), [consulta]);
  const { dados: mensal } = useCarregar(() => api(`/financeiro/mensal?ano=${ano}`), [ano]);
  const maior = Math.max(1, ...(mensal ?? []).map((m) => m.recebido_centavos));
  const total = (parcelas ?? []).reduce((s, p) => s + p.valor_centavos, 0);

  return (
    <section>
      <header className="pagina__topo">
        <h1>Financeiro</h1>
        <div className="form--linha">
          <label className="campo">
            <span>Estado</span>
            <select aria-label="Estado" value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="">Todas</option>
              {Object.entries(ROTULO_ESTADO_PARCELA).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </select>
          </label>
          <label className="campo">
            <span>Mês de vencimento</span>
            <input type="month" aria-label="Mês de vencimento" value={mes} onChange={(e) => setMes(e.target.value)} />
          </label>
        </div>
      </header>
      <Aviso erro={erro} />

      <section className="cartao">
        {parcelas && (parcelas.length ? (
          <table className="tabela">
            <thead>
              <tr><th>Vencimento</th><th>Projeto</th><th>Cliente</th><th>Descrição</th><th>Estado</th><th className="num">Valor</th></tr>
            </thead>
            <tbody>
              {parcelas.map((p) => (
                <tr key={p.id}>
                  <td>{formatarData(p.vencimento)}</td>
                  <td><Link to={`/projetos/${p.projeto_id}`}>{p.projeto_titulo}</Link></td>
                  <td>{p.cliente_nome}</td>
                  <td>{p.descricao ?? '—'}</td>
                  <td><span className={`etiqueta etiqueta--${p.estado}`}>{ROTULO_ESTADO_PARCELA[p.estado]}</span></td>
                  <td className="num">{formatarDinheiro(p.valor_centavos)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><th colSpan={5}>Total</th><th className="num">{formatarDinheiro(total)}</th></tr>
            </tfoot>
          </table>
        ) : <p className="vazio">Nenhuma parcela com esses filtros.</p>)}
      </section>

      <section className="cartao">
        <h2>Recebido por mês em {ano}</h2>
        {mensal && (
          <table className="tabela">
            <tbody>
              {mensal.map((m) => (
                <tr key={m.mes}>
                  <td style={{ width: 180 }}>{nomeMes(m.mes)}</td>
                  <td><div className="barra" style={{ width: `${(m.recebido_centavos / maior) * 100}%` }} /></td>
                  <td className="num" style={{ width: 140 }}>{formatarDinheiro(m.recebido_centavos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </section>
  );
}
