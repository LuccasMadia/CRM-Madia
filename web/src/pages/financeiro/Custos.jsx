import { Link } from 'react-router';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { Aviso } from '../../components/Aviso.jsx';
import { formatarDinheiro } from '../../lib/dinheiro.js';
import { formatarData } from '../../lib/datas.js';
import { Ferramentas } from './Ferramentas.jsx';

export function Custos() {
  return (
    <>
      <Ferramentas />
      <ComprasMaterial />
    </>
  );
}

// Só leitura: as compras (lotes) são cadastradas em Serviços › Placas › Materiais.
function ComprasMaterial() {
  const { dados, erro } = useCarregar(() => Promise.all([api('/placas/lotes'), api('/placas/materiais')]), []);
  const [lotes, materiais] = dados ?? [[], []];
  const nomeDo = new Map(materiais.map((m) => [m.id, m.nome]));
  const custo = (l) => l.valor_kit_centavos + (l.valor_frete_centavos ?? 0);
  const ordenados = [...lotes].sort((a, b) => b.data_compra.localeCompare(a.data_compra) || b.id - a.id);

  return (
    <section className="cartao">
      <header className="cartao-grafico__topo">
        <h2>Compras de material</h2>
        <Link className="cartao-grafico__sub" to="/servicos?aba=placas&placas=materiais">Gerenciar em Placas</Link>
      </header>
      <Aviso erro={erro} />
      {dados && (ordenados.length ? (
        <table className="tabela tabela--compras">
          <thead>
            <tr><th>Material</th><th>Data</th><th className="num">Quantidade</th><th className="num">Kit</th><th className="num">Frete</th><th className="num">Total</th></tr>
          </thead>
          <tbody>
            {ordenados.map((l) => (
              <tr key={l.id}>
                <td>
                  <span className="tabela__titulo">{nomeDo.get(l.material_id) ?? '—'}</span>
                  {l.nome_lote && <span className="tabela__sub">{l.nome_lote}</span>}
                </td>
                <td>{formatarData(l.data_compra)}</td>
                <td className="num">{l.quantidade}</td>
                <td className="num">{formatarDinheiro(l.valor_kit_centavos)}</td>
                <td className="num">{formatarDinheiro(l.valor_frete_centavos)}</td>
                <td className="num tabela__dinheiro">{formatarDinheiro(custo(l))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><th colSpan={5}>Total</th><th className="num">{formatarDinheiro(ordenados.reduce((s, l) => s + custo(l), 0))}</th></tr>
          </tfoot>
        </table>
      ) : <p className="vazio">Nenhuma compra de material registrada.</p>)}
    </section>
  );
}
