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
      {projeto.qrcodes.length > 0 && (
        <p>QR: {projeto.qrcodes.map((q) => <span key={q.id} title={q.nome}>{`#${q.id}`} </span>)}</p>
      )}
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
  const { dados: resumo, recarregar } = useCarregar(() => api(`/clientes/${cliente.id}/placas`), [cliente.id, versaoVendas]);
  const [criando, setCriando] = useState(false);

  async function criar(corpo) {
    await api('/projetos', { method: 'POST', body: corpo });
    setCriando(false);
    onMudou();
    recarregar();
  }

  return (
    <div>
      <div className="pagina__topo">
        <h2>Placas NFC</h2>
        <button type="button" className="btn btn--primario" onClick={() => setCriando(true)}>+ Venda de placas</button>
      </div>
      {resumo && <p>{`Já comprou ${resumo.ja_comprou} ${resumo.ja_comprou === 1 ? 'placa' : 'placas'}`}</p>}
      {projetos.length ? (
        <ul className="lista">
          {projetos.map((p) => <CartaoVenda key={p.id} cliente={cliente} projeto={p} onMudou={onMudou} />)}
        </ul>
      ) : <p className="vazio">Nenhuma venda de placas pelo perfil ainda.</p>}

      {resumo?.vendas_avulsas.length > 0 && (
        <section className="cartao">
          <h3>Vendas avulsas</h3>
          <table className="tabela">
            <tbody>
              {resumo.vendas_avulsas.map((v) => (
                <tr key={v.id}>
                  <td>{`${v.modelo_nome} × ${v.quantidade}`}</td>
                  <td className="num">{formatarDinheiro(v.preco_vendido_centavos * v.quantidade)}</td>
                  <td>{formatarData(v.data_venda)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="cartao">
        <h3>QR Codes do cliente</h3>
        {cliente.qrcodes.length ? (
          <ul className="lista">
            {cliente.qrcodes.map((q) => (
              <li key={q.id}><span className="vazio">{`#${q.id}`}</span><Link to={`/qrcodes/${q.id}`}>{q.nome}</Link></li>
            ))}
          </ul>
        ) : <p className="vazio">Nenhum QR ainda.</p>}
      </section>

      {criando && (
        <Modal titulo="Nova venda de placas" onFechar={() => setCriando(false)}>
          <FormVendaPlacas cliente={cliente} onSalvar={criar} />
        </Modal>
      )}
    </div>
  );
}
