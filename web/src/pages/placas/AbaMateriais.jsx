import { useState } from 'react';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useConfirmacao } from '../../hooks/useConfirmacao.jsx';
import { notificar } from '../../lib/notificacoes.js';
import { Aviso } from '../../components/Aviso.jsx';
import { Modal } from '../../components/Modal.jsx';
import { FormPlacaMaterial } from '../../components/FormPlacaMaterial.jsx';
import { formatarDinheiro } from '../../lib/dinheiro.js';

export function AbaMateriais({ seletor, onMudou }) {
  const [confirmar, dialogo] = useConfirmacao();
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState(null);
  const { dados: materiais, erro, recarregar: recarregarLista } = useCarregar(() => api('/placas/materiais'), []);
  // O que muda aqui pode mexer no estoque: a página recarrega o "Pede atenção" junto.
  function recarregar() {
    recarregarLista();
    onMudou?.();
  }

  async function criar(dados) {
    await api('/placas/materiais', { method: 'POST', body: dados });
    setCriando(false);
    recarregar();
    notificar('Material criado');
  }

  async function salvarEdicao(dados) {
    await api(`/placas/materiais/${editando.id}`, { method: 'PUT', body: dados });
    setEditando(null);
    recarregar();
    notificar('Material salvo');
  }

  function remover(material) {
    confirmar({
      titulo: `Excluir o material ${material.nome}?`,
      mensagem: 'Essa ação não pode ser desfeita.',
      onConfirmar: async () => {
        await api(`/placas/materiais/${material.id}`, { method: 'DELETE' });
        notificar('Material excluído');
        recarregar();
      },
    });
  }

  async function desativar(material) {
    await api(`/placas/materiais/${material.id}/desativar`, { method: 'POST' });
    recarregar();
  }

  async function ativar(material) {
    await api(`/placas/materiais/${material.id}/ativar`, { method: 'POST' });
    recarregar();
  }

  function linhaMaterial(m) {
    return (
      <tr key={m.id} className={m.ativo ? undefined : 'tabela__linha--inativa'}>
        <td>{m.nome}</td>
        <td className="num">
          {m.estoque_atual < 0 ? <span className="etiqueta etiqueta--atrasada">{m.estoque_atual}</span> : m.estoque_atual}
        </td>
        <td className="num">{m.custo_unitario_atual === null ? '—' : formatarDinheiro(m.custo_unitario_atual)}</td>
        <td>
          <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => setEditando(m)}>Editar</button>{' '}
          {m.ativo ? (
            <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => desativar(m)}>Desativar</button>
          ) : (
            <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => ativar(m)}>Reativar</button>
          )}{' '}
          <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => remover(m)}>Excluir</button>
        </td>
      </tr>
    );
  }

  const ativos = (materiais ?? []).filter((m) => m.ativo);
  const inativos = (materiais ?? []).filter((m) => !m.ativo);

  return (
    <section>
      <div className="barra-visao">
        {seletor}
        <button type="button" className="btn btn--primario barra-visao__acao" onClick={() => setCriando(true)}>+ Material</button>
      </div>
      <Aviso erro={erro} />
      {materiais && (materiais.length ? (
        <table className="tabela">
          <thead><tr><th>Nome</th><th className="num">Estoque atual</th><th className="num">Custo unitário atual</th><th></th></tr></thead>
          <tbody>
            {ativos.map(linhaMaterial)}
            {inativos.length > 0 && <tr className="tabela__divisoria"><td colSpan={4}>Inativos</td></tr>}
            {inativos.map(linhaMaterial)}
          </tbody>
        </table>
      ) : <p className="vazio">Nenhum material cadastrado.</p>)}
      {criando && (
        <Modal titulo="Novo material" onFechar={() => setCriando(false)}>
          <FormPlacaMaterial rotuloBotao="Criar material" onSalvar={criar} />
        </Modal>
      )}
      {editando && (
        <Modal titulo="Editar material" onFechar={() => setEditando(null)}>
          <FormPlacaMaterial inicial={editando} rotuloBotao="Salvar" onSalvar={salvarEdicao} />
        </Modal>
      )}
      {dialogo}
    </section>
  );
}
