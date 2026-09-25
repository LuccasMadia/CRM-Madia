import { Link } from 'react-router';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { Aviso } from '../components/Aviso.jsx';
import { Numero } from '../components/Numero.jsx';
import { formatarDinheiro } from '../lib/dinheiro.js';
import { formatarData } from '../lib/datas.js';

const ROTULO_ITEM = { parcela: 'Parcela', entrega: 'Entrega', conteudo: 'Conteúdo' };
const destino = (item) => (item.projeto_id ? `/projetos/${item.projeto_id}` : '/conteudo');

function rotuloFalta({ falta_portfolio: faltaPortfolio, falta_instagram: faltaInstagram }) {
  if (faltaPortfolio && faltaInstagram) return 'Instagram e Portfólio';
  if (faltaPortfolio) return 'Portfólio';
  return 'Instagram';
}

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
  const { cartoes, tarefas_por_projeto: tarefasPorProjeto, divulgacao_pendente: divulgacaoPendente, proximos } = dados;

  return (
    <section>
      <header className="pagina__topo"><h1>Início</h1></header>
      <div className="cartoes">
        <Numero rotulo="A receber este mês">{formatarDinheiro(cartoes.a_receber_mes_centavos)}</Numero>
        <Numero rotulo="Parcelas atrasadas">
          {cartoes.atrasadas.quantidade} · {formatarDinheiro(cartoes.atrasadas.total_centavos)}
        </Numero>
        <Numero rotulo="Projetos em andamento">{cartoes.em_andamento}</Numero>
        <Numero rotulo="Propostas abertas">
          {cartoes.propostas.quantidade} · {formatarDinheiro(cartoes.propostas.total_centavos)}
        </Numero>
      </div>

      {divulgacaoPendente.length > 0 && (
        <section className="cartao">
          <h2>Divulgação pendente</h2>
          <table className="tabela">
            <tbody>
              {divulgacaoPendente.map((p) => (
                <tr key={p.projeto_id}>
                  <td><Link to={`/projetos/${p.projeto_id}`}>{p.titulo}</Link></td>
                  <td>Falta: {rotuloFalta(p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

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
