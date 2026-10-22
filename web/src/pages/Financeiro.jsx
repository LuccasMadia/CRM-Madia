import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { Aviso } from '../components/Aviso.jsx';
import { Numero } from '../components/Numero.jsx';
import { formatarDinheiro } from '../lib/dinheiro.js';
import { formatarData, hojeISO, nomeMes } from '../lib/datas.js';
import { ROTULO_ESTADO_PARCELA, ROTULO_SERVICO, ABA_DO_SERVICO } from '../lib/rotulos.js';
import { Ferramentas } from './financeiro/Ferramentas.jsx';

const ABAS = [
  { aba: 'recebimentos', nome: 'Recebimentos' },
  { aba: 'ferramentas', nome: 'Ferramentas' },
];

const parcelas = (n) => `${n} ${n === 1 ? 'parcela' : 'parcelas'}`;

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
  const limpar = () => { setEstado(''); setMes(''); setServico(''); };

  const { dados: lista, erro } = useCarregar(() => api(`/parcelas${consulta ? `?${consulta}` : ''}`), [consulta]);
  const { dados: mensal } = useCarregar(() => api(`/financeiro/mensal?ano=${ano}`), [ano]);
  const total = (lista ?? []).reduce((s, p) => s + p.valor_centavos, 0);
  // somas da lista que está na tela (já filtrada), por estado
  const somaDo = (e) => {
    const doEstado = (lista ?? []).filter((p) => p.estado === e);
    return { centavos: doEstado.reduce((s, p) => s + p.valor_centavos, 0), quantidade: doEstado.length };
  };
  const linkDoProjeto = (p) => {
    if (p.tipo === 'venda_placa') return '/servicos?aba=placas&placas=vendas';
    return p.servico === 'site_sistema'
      ? `/projetos/${p.projeto_id}`
      : `/clientes/${p.cliente_id}?aba=${ABA_DO_SERVICO[p.servico]}`;
  };

  return (
    <section>
      {lista && (
        <div className="cartoes cartoes--resumo">
          <Resumo rotulo="Recebido" tom="ok" {...somaDo('paga')} />
          <Resumo rotulo="A receber" {...somaDo('pendente')} />
          <Resumo rotulo="Atrasado" tom="perigo" {...somaDo('atrasada')} />
        </div>
      )}

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
        {consulta && <button type="button" className="btn btn--fantasma filtros-recebimentos__limpar" onClick={limpar}>Limpar filtros</button>}
      </div>
      <Aviso erro={erro} />

      <section className="cartao">
        {lista && (lista.length ? (
          <table className="tabela tabela--recebimentos">
            <thead>
              <tr><th>Cliente</th><th>Serviço</th><th>Descrição</th><th>Vencimento</th><th>Estado</th><th className="num">Valor</th></tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <tr key={`${p.tipo}-${p.id}`} className={p.estado === 'atrasada' ? 'tabela__linha--atrasada' : undefined}>
                  <td>
                    {/* projeto com o mesmo nome do cliente: o próprio nome vira o link, sem repetir embaixo */}
                    {p.projeto_titulo === p.cliente_nome
                      ? <Link className="tabela__titulo" to={linkDoProjeto(p)}>{p.projeto_titulo}</Link>
                      : (
                        <>
                          <span className="tabela__titulo">{p.cliente_nome}</span>
                          <Link className="tabela__sub" to={linkDoProjeto(p)}>{p.projeto_titulo}</Link>
                        </>
                      )}
                  </td>
                  <td>{ROTULO_SERVICO[p.servico]}</td>
                  <td>{p.descricao ?? '—'}</td>
                  <td>{formatarData(p.vencimento)}</td>
                  <td><span className={`etiqueta etiqueta--${p.estado}`}>{ROTULO_ESTADO_PARCELA[p.estado]}</span></td>
                  <td className="num tabela__dinheiro">{formatarDinheiro(p.valor_centavos)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><th colSpan={5}>Total · {parcelas(lista.length)}</th><th className="num">{formatarDinheiro(total)}</th></tr>
            </tfoot>
          </table>
        ) : <p className="vazio">Nenhuma parcela com esses filtros.</p>)}
      </section>

      {mensal && <RecebidoPorMes ano={ano} mensal={mensal} />}
    </section>
  );
}

function Resumo({ rotulo, tom, centavos, quantidade }) {
  return (
    <Numero rotulo={rotulo} tom={quantidade ? tom : undefined} detalhe={parcelas(quantidade)}>
      {formatarDinheiro(centavos)}
    </Numero>
  );
}

function RecebidoPorMes({ ano, mensal }) {
  const maior = Math.max(1, ...mensal.map((m) => m.recebido_centavos));
  const totalAno = mensal.reduce((s, m) => s + m.recebido_centavos, 0);
  const mesAtual = hojeISO().slice(0, 7);
  const lista = useRef(null);
  // no celular as colunas rolam de lado: abre com o mês atual no meio
  useEffect(() => {
    const ol = lista.current;
    const atual = ol?.querySelector('.colunas-mes__mes--atual');
    if (atual && ol.scrollWidth > ol.clientWidth) ol.scrollLeft = atual.offsetLeft - ol.offsetLeft - (ol.clientWidth - atual.offsetWidth) / 2;
  }, []);

  return (
    <section className="cartao">
      <div className="cartao-grafico__topo">
        <h2>Recebido em {ano}</h2>
        <p className="colunas-mes__total">{formatarDinheiro(totalAno)}</p>
      </div>
      <ol ref={lista} className="colunas-mes" aria-label="Recebido por mês">
        {mensal.map((m) => {
          const vazio = !m.recebido_centavos;
          const classes = ['colunas-mes__mes', vazio && 'colunas-mes__mes--vazio', m.mes === mesAtual && 'colunas-mes__mes--atual'];
          return (
            <li key={m.mes} className={classes.filter(Boolean).join(' ')} title={`${nomeMes(m.mes)}: ${formatarDinheiro(m.recebido_centavos)}`}>
              <span className="colunas-mes__valor">{vazio ? '—' : formatarDinheiro(m.recebido_centavos)}</span>
              <span className="colunas-mes__trilho">
                <span className="colunas-mes__barra" style={{ height: `${(m.recebido_centavos / maior) * 100}%` }} />
              </span>
              <span className="colunas-mes__nome">{nomeMes(m.mes).slice(0, 3)}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
