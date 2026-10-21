import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { Aviso } from '../components/Aviso.jsx';
import { formatarDinheiro } from '../lib/dinheiro.js';
import { formatarData, hojeISO, nomeMes } from '../lib/datas.js';
import { ROTULO_ESTADO_PARCELA, ROTULO_SERVICO, ABA_DO_SERVICO } from '../lib/rotulos.js';
import { Ferramentas } from './financeiro/Ferramentas.jsx';

const ABAS = [
  { aba: 'recebimentos', nome: 'Recebimentos' },
  { aba: 'ferramentas', nome: 'Ferramentas' },
];

export function Financeiro() {
  const [params, setParams] = useSearchParams();
  const aba = ABAS.some((a) => a.aba === params.get('aba')) ? params.get('aba') : 'recebimentos';

  return (
    <section>
      <header className="pagina__topo">
        <h1>Financeiro</h1>
      </header>
      <div role="tablist" className="abas">
        {ABAS.map((a) => (
          <button key={a.aba} role="tab" type="button" className="abas__aba" aria-selected={aba === a.aba} onClick={() => setParams({ aba: a.aba })}>
            {a.nome}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {aba === 'recebimentos' && <Recebimentos />}
        {aba === 'ferramentas' && <Ferramentas />}
      </div>
    </section>
  );
}

function Recebimentos() {
  const [estado, setEstado] = useState('');
  const [mes, setMes] = useState('');
  const [servico, setServico] = useState('');
  const ano = hojeISO().slice(0, 4);
  const consulta = new URLSearchParams(Object.entries({ estado, mes, servico }).filter(([, v]) => v)).toString();

  const { dados: parcelas, erro } = useCarregar(() => api(`/parcelas${consulta ? `?${consulta}` : ''}`), [consulta]);
  const { dados: mensal } = useCarregar(() => api(`/financeiro/mensal?ano=${ano}`), [ano]);
  const maior = Math.max(1, ...(mensal ?? []).map((m) => m.recebido_centavos));
  const total = (parcelas ?? []).reduce((s, p) => s + p.valor_centavos, 0);
  const linkDoProjeto = (p) => {
    if (p.tipo === 'venda_placa') return '/servicos?aba=placas&placas=vendas';
    return p.servico === 'site_sistema'
      ? `/projetos/${p.projeto_id}`
      : `/clientes/${p.cliente_id}?aba=${ABA_DO_SERVICO[p.servico]}`;
  };

  return (
    <section>
      <div className="form--linha filtros-recebimentos">
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
        <label className="campo">
          <span>Serviço</span>
          <select aria-label="Serviço" value={servico} onChange={(e) => setServico(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(ROTULO_SERVICO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
        </label>
      </div>
      <Aviso erro={erro} />

      <section className="cartao">
        {parcelas && (parcelas.length ? (
          <table className="tabela">
            <thead>
              <tr><th>Vencimento</th><th>Serviço</th><th>Projeto</th><th>Cliente</th><th>Descrição</th><th>Estado</th><th className="num">Valor</th></tr>
            </thead>
            <tbody>
              {parcelas.map((p) => (
                <tr key={`${p.tipo}-${p.id}`}>
                  <td>{formatarData(p.vencimento)}</td>
                  <td>{ROTULO_SERVICO[p.servico]}</td>
                  <td><Link to={linkDoProjeto(p)}>{p.projeto_titulo}</Link></td>
                  <td>{p.cliente_nome}</td>
                  <td>{p.descricao ?? '—'}</td>
                  <td><span className={`etiqueta etiqueta--${p.estado}`}>{ROTULO_ESTADO_PARCELA[p.estado]}</span></td>
                  <td className="num">{formatarDinheiro(p.valor_centavos)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><th colSpan={6}>Total</th><th className="num">{formatarDinheiro(total)}</th></tr>
            </tfoot>
          </table>
        ) : <p className="vazio">Nenhuma parcela com esses filtros.</p>)}
      </section>

      <section className="cartao">
        <h2>Recebido por mês em {ano}</h2>
        {mensal && (
          <table className="tabela tabela--fixa tabela--mensal">
            <tbody>
              {mensal.map((m) => (
                <tr key={m.mes}>
                  <td>{nomeMes(m.mes)}</td>
                  <td><div className="barra" style={{ width: `${(m.recebido_centavos / maior) * 100}%` }} /></td>
                  <td className="num">{formatarDinheiro(m.recebido_centavos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </section>
  );
}
