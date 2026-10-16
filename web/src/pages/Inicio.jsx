import { Link } from 'react-router';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { Aviso } from '../components/Aviso.jsx';
import { Numero } from '../components/Numero.jsx';
import { formatarDinheiro } from '../lib/dinheiro.js';
import { formatarData } from '../lib/datas.js';
import { ABA_DO_SERVICO } from '../lib/rotulos.js';

const ROTULO_ITEM = { parcela: 'Parcela', entrega: 'Entrega', conteudo: 'Conteúdo' };
const ROTULO_ENTREGA = { google_meu_negocio: 'Google Meu Negócio', placas_nfc: 'Placas NFC' };
const paginaDoServico = (item) => `/clientes/${item.cliente_id}?aba=${ABA_DO_SERVICO[item.servico]}`;
function destino(item) {
  if (item.servico && item.servico !== 'site_sistema') return paginaDoServico(item);
  return item.projeto_id ? `/projetos/${item.projeto_id}` : '/conteudo';
}
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

function ColunaTarefas({ titulo, projetos }) {
  return (
    <section className="cartao">
      <h2>{titulo}</h2>
      {projetos.length ? (
        <ul className="lista">
          {projetos.map((p) => (
            <li key={p.projeto_id} style={{ display: 'block' }}>
              <Link to={`/projetos/${p.projeto_id}`}>{p.projeto_titulo}</Link>
              <ul className="lista">
                {p.tarefas.map((t) => (
                  <li key={t.id}>
                    <span>{t.texto}</span>
                    {t.prazo && <span className="vazio">{formatarData(t.prazo)}</span>}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : <p className="vazio">Nenhuma tarefa pendente.</p>}
    </section>
  );
}

export function Inicio() {
  const { dados, erro } = useCarregar(() => api('/painel'), []);
  if (erro) return <Aviso erro={erro} />;
  if (!dados) return <p>Carregando…</p>;
  const { cartoes, tarefas_por_projeto: tarefasPorProjeto, proximos, para_entregar: paraEntregar = { gmn: 0, placas: 0, itens: [] } } = dados;

  return (
    <section>
      <header className="pagina__topo"><h1>Início</h1></header>
      <div className="cartoes">
        <Numero rotulo="A receber este mês" icone="financeiro">{formatarDinheiro(cartoes.a_receber_mes_centavos)}</Numero>
        <Numero rotulo="Parcelas atrasadas" icone="alerta">
          {cartoes.atrasadas.quantidade} · {formatarDinheiro(cartoes.atrasadas.total_centavos)}
        </Numero>
        <Numero rotulo="Projetos em andamento" icone="projetos">{cartoes.em_andamento}</Numero>
        <Numero rotulo="Propostas abertas" icone="funil">
          {cartoes.propostas.quantidade} · {formatarDinheiro(cartoes.propostas.total_centavos)}
        </Numero>
      </div>

      <section className="cartao">
        <h2>Para entregar</h2>
        <p>{`${plural(paraEntregar.gmn, 'GMN pendente', 'GMN pendentes')} · ${plural(paraEntregar.placas, 'venda de placas a entregar', 'vendas de placas a entregar')}`}</p>
        {paraEntregar.itens.length > 0 && (
          <ul className="lista">
            {paraEntregar.itens.map((item) => (
              <li key={item.projeto_id}>
                <Link to={paginaDoServico(item)}>{`${item.cliente_nome} — ${ROTULO_ENTREGA[item.servico]}`}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grade-2">
        <ColunaTarefas titulo="Projetos reais" projetos={tarefasPorProjeto.reais} />
        <ColunaTarefas titulo="Projetos fictícios" projetos={tarefasPorProjeto.ficticios} />
      </div>

      <section className="cartao">
        <h2>Próximos 7 dias</h2>
        {proximos.length ? (
          <table className="tabela">
            <tbody>
              {proximos.map((item) => (
                <tr key={`${item.tipo}-${item.id}`}>
                  <td className={item.atrasado ? 'item-atrasado' : undefined}>
                    {formatarData(item.data)}{item.atrasado && <> · <span>atrasado</span></>}
                  </td>
                  <td><span className="etiqueta">{ROTULO_ITEM[item.tipo]}</span></td>
                  <td><Link to={destino(item)}>{item.titulo}</Link></td>
                  <td className="vazio">{item.contexto}</td>
                  <td className="num">{item.valor_centavos ? formatarDinheiro(item.valor_centavos) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="vazio">Nada para os próximos 7 dias.</p>}
      </section>
    </section>
  );
}
