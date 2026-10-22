import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { Aviso } from '../../components/Aviso.jsx';
import { Carregando } from '../../components/Carregando.jsx';
import { Numero } from '../../components/Numero.jsx';
import { formatarDinheiro } from '../../lib/dinheiro.js';
import { formatarData, hojeISO, nomeMes } from '../../lib/datas.js';
import { ROTULO_ESTADO_PARCELA } from '../../lib/rotulos.js';
import { mesesDoAno, montarResumo } from '../../lib/resumoFinanceiro.js';

const GraficoFaturamentoCustos = lazy(() => import('../../components/graficos/GraficoFaturamentoCustos.jsx')
  .then((m) => ({ default: m.GraficoFaturamentoCustos })));

const PROXIMAS_VISIVEIS = 6;
const mesCurto = (mes) => {
  const nome = nomeMes(mes).slice(0, 3);
  return nome[0].toUpperCase() + nome.slice(1);
};
const porcento = (fracao) => `${Math.round(fracao * 100)}%`;
// no demonstrativo o cabeçalho já diz "em R$": cada célula leva só o número
const compacto = (centavos) => (centavos ? formatarDinheiro(centavos).replace(/R\$\s*/, '') : '—');

async function carregar(ano, hoje) {
  const meses = mesesDoAno(ano).filter((m) => m <= hoje.slice(0, 7));
  const [parcelas, lotes, ferramentasPorMes] = await Promise.all([
    api('/parcelas'),
    api('/placas/lotes'),
    Promise.all(meses.map((m) => api(`/ferramentas?mes=${m}`))),
  ]);
  return { ano, parcelas, lotes, ferramentasPorMes };
}

export function VisaoGeral() {
  const hoje = hojeISO();
  const anoHoje = Number(hoje.slice(0, 4));
  const [ano, setAno] = useState(anoHoje);
  const { dados, erro } = useCarregar(() => carregar(ano, hoje), [ano]);
  const resumo = useMemo(() => dados && montarResumo({ hoje, ...dados }), [dados, hoje]);

  return (
    <section>
      <div className="visao-topo">
        <div className="seletor-ano" role="group" aria-label="Ano">
          <button type="button" className="btn btn--fantasma btn--pequeno" aria-label="Ano anterior" onClick={() => setAno((a) => a - 1)}>‹</button>
          <strong aria-live="polite">{ano}</strong>
          <button type="button" className="btn btn--fantasma btn--pequeno" aria-label="Próximo ano" disabled={ano >= anoHoje} onClick={() => setAno((a) => a + 1)}>›</button>
        </div>
        <p className="visao-topo__nota">Regime de caixa: o que entrou e o que saiu em cada mês.</p>
      </div>
      <Aviso erro={erro} />
      {!resumo && !erro && <Carregando />}
      {resumo && <Painel resumo={resumo} ano={dados.ano} />}
    </section>
  );
}

function Painel({ resumo, ano }) {
  const { totais, aberto } = resumo;
  const [ferramentas, material] = resumo.custos;
  const temMovimento = totais.receita > 0 || totais.custo > 0;

  return (
    <>
      <div className="cartoes cartoes--resumo cartoes--quatro">
        <Numero rotulo="Faturamento" detalhe={`média de ${formatarDinheiro(totais.mediaMensal)} por mês`}>
          {formatarDinheiro(totais.receita)}
        </Numero>
        <Numero rotulo="Custos" detalhe={`${formatarDinheiro(ferramentas.total)} ferramentas · ${formatarDinheiro(material.total)} material`}>
          {formatarDinheiro(totais.custo)}
        </Numero>
        <Numero
          rotulo="Resultado"
          tom={totais.resultado < 0 ? 'perigo' : totais.resultado > 0 ? 'ok' : undefined}
          detalhe={totais.margem === null ? 'sem faturamento no ano' : `margem de ${porcento(totais.margem)}`}
        >
          {formatarDinheiro(totais.resultado)}
        </Numero>
        <Numero
          rotulo="Em aberto"
          detalhe={aberto.atrasado
            ? <span className="texto-perigo">{formatarDinheiro(aberto.atrasado)} atrasado</span>
            : `${aberto.quantidade} ${aberto.quantidade === 1 ? 'parcela' : 'parcelas'} a receber`}
        >
          {formatarDinheiro(aberto.total)}
        </Numero>
      </div>

      <section className="cartao">
        <header className="cartao-grafico__topo">
          <h2>Faturamento x custos</h2>
          <ul className="legenda" aria-label="Legenda">
            <li><span className="legenda__marca legenda__marca--entrada" />Faturamento</li>
            <li><span className="legenda__marca legenda__marca--saida" />Custos</li>
            <li><span className="legenda__marca legenda__marca--linha" />Resultado acumulado</li>
          </ul>
        </header>
        {temMovimento ? (
          <Suspense fallback={<Carregando />}>
            <GraficoFaturamentoCustos
              dados={resumo.meses.map((m) => ({ rotulo: mesCurto(m.mes), receita: m.receita, custo: m.custo, acumulado: m.futuro ? null : m.acumulado }))}
            />
          </Suspense>
        ) : <p className="vazio">Nenhuma entrada ou saída em {ano}.</p>}
      </section>

      <Demonstrativo resumo={resumo} ano={ano} />

      <div className="grade-2">
        <Composicao receitas={resumo.receitas} custos={resumo.custos} totais={totais} ano={ano} />
        <Proximas proximas={resumo.proximas} />
      </div>
    </>
  );
}

function Demonstrativo({ resumo, ano }) {
  const caixa = useRef(null);
  const mesHoje = hojeISO().slice(0, 7);
  const classeMes = (mes) => ['num', mes === mesHoje && 'demonstrativo__atual', mes > mesHoje && 'demonstrativo__futuro'].filter(Boolean).join(' ');

  // no celular a tabela rola de lado: abre com o mês atual encostado à direita e os anteriores à vista
  useEffect(() => {
    const el = caixa.current;
    const atual = el?.querySelector('thead .demonstrativo__atual');
    if (atual && el.scrollWidth > el.clientWidth) el.scrollLeft = atual.offsetLeft + atual.offsetWidth - el.clientWidth;
  }, []);

  const linha = (nome, valores, total, classe) => (
    <tr key={nome} className={classe}>
      <th scope="row">{nome}</th>
      {resumo.meses.map((m, i) => (
        <td key={m.mes} className={`${classeMes(m.mes)}${valores[i] < 0 ? ' texto-perigo' : ''}`}>{m.futuro ? '' : compacto(valores[i])}</td>
      ))}
      <td className={`num demonstrativo__total${total < 0 ? ' texto-perigo' : ''}`}>{compacto(total)}</td>
    </tr>
  );
  const grupo = (nome) => (
    <tr className="demonstrativo__grupo"><th scope="rowgroup">{nome}</th><td colSpan={13} /></tr>
  );

  return (
    <section className="cartao">
      <header className="cartao-grafico__topo">
        <h2>Demonstrativo {ano}</h2>
        <span className="cartao-grafico__sub">valores em R$</span>
      </header>
      <div className="demonstrativo" ref={caixa}>
        <table className="tabela tabela--fixa demonstrativo__tabela">
          <thead>
            <tr>
              <th scope="col"><span className="sr-only">Conta</span></th>
              {resumo.meses.map((m) => <th key={m.mes} scope="col" className={classeMes(m.mes)}>{mesCurto(m.mes)}</th>)}
              <th scope="col" className="num demonstrativo__total">Total</th>
            </tr>
          </thead>
          <tbody>
            {grupo('Receitas')}
            {resumo.receitas.map((c) => linha(c.nome, resumo.meses.map((m) => c.porMes[m.mes]), c.total))}
            {linha('Total de receitas', resumo.meses.map((m) => m.receita), resumo.totais.receita, 'demonstrativo__soma')}
            {grupo('Custos')}
            {resumo.custos.map((c) => linha(c.nome, resumo.meses.map((m) => c.porMes[m.mes]), c.total))}
            {linha('Total de custos', resumo.meses.map((m) => m.custo), resumo.totais.custo, 'demonstrativo__soma')}
          </tbody>
          <tfoot>
            {linha('Resultado', resumo.meses.map((m) => m.resultado), resumo.totais.resultado, 'demonstrativo__resultado')}
            <tr className="demonstrativo__margem">
              <th scope="row">Margem</th>
              {resumo.meses.map((m) => (
                <td key={m.mes} className={classeMes(m.mes)}>{m.futuro ? '' : m.receita ? porcento(m.resultado / m.receita) : '—'}</td>
              ))}
              <td className="num demonstrativo__total">{resumo.totais.margem === null ? '—' : porcento(resumo.totais.margem)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function Composicao({ receitas, custos, totais, ano }) {
  return (
    <section className="cartao">
      <header className="cartao-grafico__topo">
        <h2>Composição</h2>
        <span className="cartao-grafico__sub">{ano}</span>
      </header>
      <Participacao titulo="De onde vem" categorias={receitas} total={totais.receita} vazio={`Nenhum recebimento em ${ano}.`} />
      <Participacao titulo="Para onde vai" categorias={custos} total={totais.custo} vazio={`Nenhum custo em ${ano}.`} saida />
    </section>
  );
}

function Participacao({ titulo, categorias, total, vazio, saida = false }) {
  const comValor = categorias.filter((c) => c.total > 0).sort((a, b) => b.total - a.total);
  return (
    <div className="participacao__bloco">
      <h3 className="cartao__titulo">{titulo}</h3>
      {comValor.length ? (
        <ul className="participacao" aria-label={titulo}>
          {comValor.map((c) => (
            <li key={c.chave}>
              <div className="participacao__topo">
                <span>{c.nome}</span>
                <span className="participacao__valor">{formatarDinheiro(c.total)} <span className="participacao__pct">{porcento(c.total / total)}</span></span>
              </div>
              <span className="participacao__trilho">
                <span className={`participacao__barra${saida ? ' participacao__barra--saida' : ''}`} style={{ width: `${(c.total / total) * 100}%` }} />
              </span>
            </li>
          ))}
        </ul>
      ) : <p className="vazio">{vazio}</p>}
    </div>
  );
}

function Proximas({ proximas }) {
  const visiveis = proximas.slice(0, PROXIMAS_VISIVEIS);
  const total = proximas.reduce((s, p) => s + p.valor_centavos, 0);
  return (
    <section className="cartao">
      <header className="cartao-grafico__topo">
        <h2>Próximos 30 dias</h2>
        {proximas.length > 0 && <span className="cartao-grafico__sub">{formatarDinheiro(total)} a entrar</span>}
      </header>
      {visiveis.length ? (
        <ul className="proximas">
          {visiveis.map((p) => (
            <li key={`${p.tipo}-${p.id}`} className={p.estado === 'atrasada' ? 'proximas__item proximas__item--atrasada' : 'proximas__item'}>
              <div className="proximas__texto">
                <span className="tabela__titulo">{p.cliente_nome}</span>
                <span className="tabela__sub">{p.descricao ?? p.projeto_titulo} · vence {formatarData(p.vencimento)}</span>
              </div>
              <div className="proximas__valor">
                <span className="tabela__dinheiro">{formatarDinheiro(p.valor_centavos)}</span>
                <span className={`etiqueta etiqueta--${p.estado}`}>{ROTULO_ESTADO_PARCELA[p.estado]}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="vazio">Nada vencendo nos próximos 30 dias.</p>}
      <p className="proximas__rodape">
        {proximas.length > PROXIMAS_VISIVEIS && <span>+ {proximas.length - PROXIMAS_VISIVEIS} outras · </span>}
        <Link to="?aba=recebimentos">Ver todos os recebimentos</Link>
      </p>
    </section>
  );
}
