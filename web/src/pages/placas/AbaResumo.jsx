import { useState } from 'react';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { Aviso } from '../../components/Aviso.jsx';
import { Modal } from '../../components/Modal.jsx';
import { Numero } from '../../components/Numero.jsx';
import { FormPlacaMontagem } from '../../components/FormPlacaMontagem.jsx';
import { AvisoEstoqueMontagem } from './AbaMontagem.jsx';
import { formatarDinheiro } from '../../lib/dinheiro.js';
import { diasDesde } from '../../lib/datas.js';

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

function VendasAReceber({ aReceber, onRecebi }) {
  return (
    <section className="cartao" aria-labelledby="titulo-a-receber">
      <h2 id="titulo-a-receber">Vendidas e ainda não recebidas</h2>
      {aReceber.vendas.length ? (
        <table className="tabela">
          <thead><tr><th>Cliente</th><th>Modelo</th><th>Vendida</th><th className="num">Valor</th><th></th></tr></thead>
          <tbody>
            {aReceber.vendas.map((v) => {
              const nome = v.cliente_nome ?? v.comprador_nome;
              const dias = diasDesde(v.data_venda);
              return (
                <tr key={v.id}>
                  <td>{nome}</td>
                  <td>{`${v.modelo_nome} × ${v.quantidade}`}</td>
                  <td>
                    <span className={`etiqueta ${v.estado === 'atrasada' ? 'etiqueta--atrasada' : 'etiqueta--proposta'}`}>
                      {dias <= 0 ? 'hoje' : `há ${plural(dias, 'dia', 'dias')}`}
                    </span>
                  </td>
                  <td className="num">{formatarDinheiro(v.valor_total_centavos)}</td>
                  <td className="num">
                    <button type="button" className="btn btn--primario btn--pequeno" aria-label={`Recebi de ${nome}`} onClick={() => onRecebi(v)}>Recebi</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : <p className="vazio">Tudo recebido.</p>}
    </section>
  );
}

function Montadas({ montadas, onMontar }) {
  return (
    <section className="cartao" aria-labelledby="titulo-montadas">
      <div className="cartao-grafico__topo">
        <h2 id="titulo-montadas">Montadas, prontas para vender</h2>
        <button type="button" className="btn btn--pequeno" onClick={onMontar}>+ Montar</button>
      </div>
      {montadas.length ? (
        <ul className="lista-montadas">
          {montadas.map((m) => (
            <li key={m.modelo_id}>
              <span>
                {m.modelo_nome}
                {m.da_pra_montar !== null && <small className="vazio">{`os materiais dão para mais ${m.da_pra_montar}`}</small>}
              </span>
              <strong>{m.montadas}</strong>
            </li>
          ))}
        </ul>
      ) : <p className="vazio">Nenhum modelo ativo.</p>}
    </section>
  );
}

export function AbaResumo() {
  const { dados: resumo, erro, recarregar } = useCarregar(() => api('/placas/resumo'), []);
  const [montando, setMontando] = useState(false);
  const [avisosEstoque, setAvisosEstoque] = useState([]);
  const envio = useEnvio();

  function receber(venda) {
    envio.executar(async () => {
      await api(`/placas/vendas/${venda.id}/recebimento`, { method: 'POST' });
      recarregar();
    });
  }

  async function montar(dados) {
    const res = await api('/placas/montagens', { method: 'POST', body: dados });
    setMontando(false);
    setAvisosEstoque(res.avisos_estoque ?? []);
    recarregar();
  }

  return (
    <section>
      <Aviso erro={erro ?? envio.erro} />
      <AvisoEstoqueMontagem avisos={avisosEstoque} />
      {resumo && (
        <>
          <div className="cartoes">
            <Numero rotulo="A receber" icone="financeiro">{formatarDinheiro(resumo.a_receber.total_centavos)}</Numero>
            <Numero rotulo="Montadas prontas" icone="nfc">{resumo.montadas.reduce((s, m) => s + Math.max(0, m.montadas), 0)}</Numero>
            <Numero rotulo="Vendidas no mês" icone="projetos">{resumo.mes.vendidas}</Numero>
            <Numero rotulo="Lucro no mês" icone="financeiro">{formatarDinheiro(resumo.mes.lucro_centavos)}</Numero>
          </div>
          <div className="painel-placas">
            <VendasAReceber aReceber={resumo.a_receber} onRecebi={receber} />
            <Montadas montadas={resumo.montadas} onMontar={() => setMontando(true)} />
          </div>

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

          <section className="cartao">
            <h2>Prejuízo com avarias</h2>
            <p><strong>Total perdido:</strong> {formatarDinheiro(resumo.prejuizo_avarias.total_centavos)}</p>
            {resumo.prejuizo_avarias.por_modelo.length ? (
              <table className="tabela">
                <thead><tr><th>Modelo</th><th className="num">Quantidade avariada</th><th className="num">Custo perdido</th></tr></thead>
                <tbody>
                  {resumo.prejuizo_avarias.por_modelo.map((m) => (
                    <tr key={m.modelo_id}>
                      <td>{m.modelo_nome}</td>
                      <td className="num">{m.quantidade}</td>
                      <td className="num">{formatarDinheiro(m.total_centavos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="vazio">Nenhuma avaria lançada ainda.</p>}
          </section>
        </>
      )}
      {montando && (
        <Modal titulo="Montar placas" onFechar={() => setMontando(false)}>
          <FormPlacaMontagem onSalvar={montar} />
        </Modal>
      )}
    </section>
  );
}
