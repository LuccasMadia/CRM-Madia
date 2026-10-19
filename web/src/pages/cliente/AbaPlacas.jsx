import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { useParcelas, parcelaUnica } from '../../hooks/useParcelas.js';
import { Aviso } from '../../components/Aviso.jsx';
import { Modal } from '../../components/Modal.jsx';
import { FormVendaPlacas } from '../../components/FormVendaPlacas.jsx';
import { formatarDinheiro } from '../../lib/dinheiro.js';
import { formatarData } from '../../lib/datas.js';
import { CobrancaServico } from './CobrancaServico.jsx';
import { SituacaoVenda } from '../placas/AbaVendas.jsx';

function CartaoVenda({ cliente, projeto, onMudou }) {
  const { parcelas, recarregar } = useParcelas(projeto);
  const [editando, setEditando] = useState(false);
  const envio = useEnvio();
  const linha = projeto.servicos.find((s) => s.tipo === 'placas_nfc');

  function marcarEntregue() {
    envio.executar(async () => {
      await api(`/projetos/${projeto.id}`, { method: 'PUT', body: { etapa: 'entregue' } });
      onMudou();
    });
  }

  function excluir() {
    const aviso = linha?.venda_id
      ? 'Excluir esta venda de placas? A venda continua em Placas › Vendas; para devolver o estoque, exclua-a por lá.'
      : 'Excluir esta venda de placas?';
    if (!window.confirm(aviso)) return;
    envio.executar(async () => {
      await api(`/projetos/${projeto.id}`, { method: 'DELETE' });
      onMudou();
    });
  }

  async function salvar(corpo) {
    await api(`/projetos/${projeto.id}`, { method: 'PUT', body: corpo });
    setEditando(false);
    onMudou();
  }

  return (
    <li className="cartao" style={{ display: 'block' }}>
      <p><strong>{`${linha?.modelo_nome ?? '—'} × ${linha?.quantidade ?? 0}`}</strong></p>
      <p><CobrancaServico projeto={projeto} parcelas={parcelas} onPago={() => { recarregar(); onMudou(); }} /></p>
      <p>
        {projeto.etapa === 'entregue'
          ? <span className="etiqueta etiqueta--entregue">Entregue</span>
          : <>
              <span className="etiqueta etiqueta--andamento">Pendente</span>{' '}
              <button type="button" className="btn btn--fantasma btn--pequeno" onClick={marcarEntregue}>Marcar entregue</button>
            </>}
      </p>
      {projeto.notas && <p className="vazio">{projeto.notas}</p>}
      <p>
        <button type="button" className="btn" onClick={() => setEditando(true)}>Editar</button>{' '}
        <button type="button" className="btn btn--perigo" onClick={excluir}>Excluir</button>
      </p>
      <Aviso erro={envio.erro} />
      {editando && (
        <Modal titulo="Editar venda de placas" onFechar={() => setEditando(false)}>
          <FormVendaPlacas cliente={cliente} projeto={projeto} parcela={parcelaUnica(parcelas)} onSalvar={salvar} />
        </Modal>
      )}
    </li>
  );
}

export function AbaPlacas({ cliente, projetos, onMudou }) {
  // A lista é um array novo a cada render; a dependência precisa ser uma string estável.
  const versaoVendas = projetos.map((p) => `${p.id}:${p.atualizado_em}`).join(',');
  const { dados: resumo } = useCarregar(() => api(`/clientes/${cliente.id}/placas`), [cliente.id, versaoVendas]);

  // Venda de placa se lança só em Serviços › Placas › Vendas; aqui ficam as vendas deste cliente.
  return (
    <div>
      <div className="pagina__topo">
        <h2>Placas NFC</h2>
        <Link className="btn btn--primario" to={`/servicos?aba=placas&nova_venda=${cliente.id}`}>Lançar venda</Link>
      </div>
      {resumo && <p>{`Já comprou ${resumo.ja_comprou} ${resumo.ja_comprou === 1 ? 'placa' : 'placas'}`}</p>}
      {resumo && (resumo.vendas.length ? (
        <section className="cartao">
          <table className="tabela">
            <thead><tr><th>Data</th><th>Modelo</th><th className="num">Valor</th><th>Situação</th></tr></thead>
            <tbody>
              {resumo.vendas.map((v) => (
                <tr key={v.id}>
                  <td>{formatarData(v.data_venda)}</td>
                  <td>{`${v.modelo_nome} × ${v.quantidade}`}</td>
                  <td className="num">{formatarDinheiro(v.valor_total_centavos)}</td>
                  <td><SituacaoVenda venda={v} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : <p className="vazio">Nenhuma venda de placas para este cliente ainda.</p>)}

      {projetos.length > 0 && (
        <ul className="lista">
          {projetos.map((p) => <CartaoVenda key={p.id} cliente={cliente} projeto={p} onMudou={onMudou} />)}
        </ul>
      )}
    </div>
  );
}
