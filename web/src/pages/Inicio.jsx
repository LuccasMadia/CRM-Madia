import { Link } from 'react-router';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { Aviso } from '../components/Aviso.jsx';
import { Numero } from '../components/Numero.jsx';
import { formatarDinheiro } from '../lib/dinheiro.js';
import { formatarData } from '../lib/datas.js';

const ROTULO_ITEM = { tarefa: 'Tarefa', parcela: 'Parcela', entrega: 'Entrega', conteudo: 'Conteúdo' };
const destino = (item) => (item.projeto_id ? `/projetos/${item.projeto_id}` : '/conteudo');

export function Inicio() {
  const { dados, erro } = useCarregar(() => api('/painel'), []);
  if (erro) return <Aviso erro={erro} />;
  if (!dados) return <p>Carregando…</p>;
  const { cartoes, proximos } = dados;

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
