import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { Aviso } from '../../components/Aviso.jsx';
import { formatarDinheiro } from '../../lib/dinheiro.js';

export function AbaResumo() {
  const { dados: resumo, erro } = useCarregar(() => api('/placas/resumo'), []);

  return (
    <section>
      <Aviso erro={erro} />
      {resumo && (
        <>
          <section className="cartao">
            <h2>Lucro previsto por modelo</h2>
            {resumo.lucro_previsto_por_modelo.length ? (
              <table className="tabela">
                <thead><tr><th>Modelo</th><th className="num">Preço de venda</th><th className="num">Custo previsto</th><th className="num">Lucro previsto</th></tr></thead>
                <tbody>
                  {resumo.lucro_previsto_por_modelo.map((m) => (
                    <tr key={m.modelo_id}>
                      <td>{m.modelo_nome}</td>
                      <td className="num">{formatarDinheiro(m.preco_venda_centavos)}</td>
                      <td className="num">{m.custo_previsto_centavos === null ? '—' : formatarDinheiro(m.custo_previsto_centavos)}</td>
                      <td className="num">{m.lucro_previsto_centavos === null ? '—' : formatarDinheiro(m.lucro_previsto_centavos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="vazio">Nenhum modelo cadastrado.</p>}
          </section>

          <section className="cartao">
            <h2>Lucro real por modelo</h2>
            {resumo.lucro_real_por_modelo.length ? (
              <table className="tabela">
                <thead><tr><th>Modelo</th><th className="num">Quantidade vendida</th><th className="num">Lucro total</th><th className="num">Lucro médio</th></tr></thead>
                <tbody>
                  {resumo.lucro_real_por_modelo.map((m) => (
                    <tr key={m.modelo_id}>
                      <td>{m.modelo_nome}</td>
                      <td className="num">{m.quantidade}</td>
                      <td className="num">{formatarDinheiro(m.lucro_total_centavos)}</td>
                      <td className="num">{formatarDinheiro(m.lucro_medio_centavos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="vazio">Nenhuma venda lançada ainda.</p>}
          </section>

          <section className="cartao">
            <h2>Estoque de materiais</h2>
            {resumo.materiais.length ? (
              <table className="tabela">
                <thead><tr><th>Material</th><th className="num">Estoque atual</th></tr></thead>
                <tbody>
                  {resumo.materiais.map((m) => (
                    <tr key={m.material_id}>
                      <td>{m.nome}</td>
                      <td className="num">
                        {m.estoque_atual < 0
                          ? <span className="etiqueta etiqueta--atrasada">{m.estoque_atual}</span>
                          : m.estoque_atual}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="vazio">Nenhum material cadastrado.</p>}
          </section>
        </>
      )}
    </section>
  );
}
