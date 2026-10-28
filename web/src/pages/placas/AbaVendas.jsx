import { useState } from 'react';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { useConfirmacao } from '../../hooks/useConfirmacao.jsx';
import { notificar } from '../../lib/notificacoes.js';
import { Aviso } from '../../components/Aviso.jsx';
import { Modal } from '../../components/Modal.jsx';
import { FormPlacaVenda } from '../../components/FormPlacaVenda.jsx';
import { BotaoLembreteCobranca } from '../../components/tarefas/ModeloTarefas.jsx';
import { formatarDinheiro } from '../../lib/dinheiro.js';
import { formatarData, diasDesde } from '../../lib/datas.js';

// Visões de Vendas (a primeira é a padrão); a de lucro por modelo usa o resumo que a página já carrega.
export const VISOES_VENDAS = [['todas', 'Todas'], ['a_receber', 'A receber'], ['por_modelo', 'Lucro por modelo']];

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

export function SituacaoVenda({ venda }) {
  if (venda.via_projeto) return <span className="etiqueta">Pelo projeto</span>;
  if (venda.recebido_em) return <span className="etiqueta etiqueta--paga">{`Recebido em ${formatarData(venda.recebido_em)}`}</span>;
  return venda.estado === 'atrasada'
    ? <span className="etiqueta etiqueta--atrasada">Atrasada</span>
    : <span className="etiqueta etiqueta--proposta">A receber</span>;
}

function LucroPorModelo({ resumo }) {
  if (!resumo) return null;
  return resumo.lucro_real_por_modelo.length ? (
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
  ) : <p className="vazio">Nenhuma venda lançada ainda.</p>;
}

export function AbaVendas({ visao = 'todas', seletor = null, resumo = null, novaVendaCliente = null, onMudou }) {
  const [confirmar, dialogo] = useConfirmacao();
  const [criando, setCriando] = useState(Boolean(novaVendaCliente));
  const [avisosEstoque, setAvisosEstoque] = useState([]);
  const { dados: vendas, erro, recarregar } = useCarregar(() => api('/placas/vendas'), []);
  const envio = useEnvio();
  // "A receber" é a mesma tabela filtrada: o que ainda não entrou e não veio por projeto.
  const aReceber = visao === 'a_receber';
  const lista = vendas && (aReceber ? vendas.filter((v) => !v.recebido_em && !v.via_projeto) : vendas);

  // Venda e recebimento mexem no estoque e no "Pede atenção": a página recarrega o resumo junto.
  function mudou() {
    recarregar();
    onMudou?.();
  }

  async function criar(dados) {
    const res = await api('/placas/vendas', { method: 'POST', body: dados });
    setCriando(false);
    setAvisosEstoque(res.avisos_estoque ?? []);
    mudou();
    notificar('Venda registrada');
  }

  function remover(venda) {
    confirmar({
      titulo: `Excluir esta venda de ${venda.modelo_nome}?`,
      mensagem: 'Essa ação não pode ser desfeita.',
      onConfirmar: async () => {
        await api(`/placas/vendas/${venda.id}`, { method: 'DELETE' });
        notificar('Venda excluída');
        mudou();
      },
    });
  }

  function mudarRecebimento(venda) {
    envio.executar(async () => {
      await api(`/placas/vendas/${venda.id}/recebimento`, { method: venda.recebido_em ? 'DELETE' : 'POST' });
      mudou();
    });
  }

  return (
    <section>
      <div className="barra-visao">
        {seletor}
        <button type="button" className="btn btn--primario barra-visao__acao" onClick={() => setCriando(true)}>+ Venda</button>
      </div>
      <Aviso erro={erro ?? envio.erro} />
      {avisosEstoque.length > 0 && (
        <p className="aviso aviso--erro" role="alert">
          Estoque negativo após esta venda: {avisosEstoque.map((a) => `${a.nome} (${a.estoque_atual})`).join(', ')}
        </p>
      )}
      {visao === 'por_modelo' && <LucroPorModelo resumo={resumo} />}
      {visao !== 'por_modelo' && lista && (lista.length ? (
        <table className="tabela">
          <thead>
            <tr><th>Data</th><th>Modelo</th><th>Comprador</th><th className="num">Qtd.</th><th className="num">Vendido</th><th className="num">Lucro real</th><th>Situação</th><th></th></tr>
          </thead>
          <tbody>
            {lista.map((v) => {
              const nome = v.loja_nome ? `${v.cliente_nome} · ${v.loja_nome}` : (v.cliente_nome ?? v.comprador_nome);
              const dias = diasDesde(v.data_venda);
              return (
                <tr key={v.id}>
                  <td>{formatarData(v.data_venda)}</td>
                  <td>{v.modelo_nome}</td>
                  <td>{nome}</td>
                  <td className="num">{v.quantidade}</td>
                  <td className="num">{formatarDinheiro(v.preco_vendido_centavos)}</td>
                  <td className="num">{formatarDinheiro(v.lucro_real_centavos)}</td>
                  <td>
                    <SituacaoVenda venda={v} />
                    {aReceber && <small className="vazio situacao-venda__dias">{dias <= 0 ? 'hoje' : `há ${plural(dias, 'dia', 'dias')}`}</small>}
                  </td>
                  <td className="num">
                    {!v.via_projeto && (v.recebido_em
                      ? <button type="button" className="btn btn--fantasma btn--pequeno" aria-label="Desfazer recebimento" onClick={() => mudarRecebimento(v)}>Desfazer</button>
                      : <button type="button" className={`btn btn--pequeno${aReceber ? ' btn--primario' : ''}`} aria-label={`Recebi de ${nome}`} onClick={() => mudarRecebimento(v)}>Recebi</button>)}{' '}
                    {aReceber && <><BotaoLembreteCobranca placaVendaId={v.id} nome={nome} />{' '}</>}
                    <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => remover(v)}>Excluir</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : <p className="vazio">{aReceber ? 'Tudo recebido.' : 'Nenhuma venda lançada ainda.'}</p>)}
      {criando && (
        <Modal titulo="Nova venda" onFechar={() => setCriando(false)}>
          <FormPlacaVenda rotuloBotao="Lançar venda" inicial={novaVendaCliente ? { cliente_id: novaVendaCliente } : {}} onSalvar={criar} />
        </Modal>
      )}
      {dialogo}
    </section>
  );
}
