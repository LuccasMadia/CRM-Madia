import { useState } from 'react';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { Aviso } from '../../components/Aviso.jsx';
import { Modal } from '../../components/Modal.jsx';
import { FormPlacaMaterial } from '../../components/FormPlacaMaterial.jsx';
import { formatarDinheiro } from '../../lib/dinheiro.js';

export function AbaMateriais() {
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState(null);
  const { dados: materiais, erro, recarregar } = useCarregar(() => api('/placas/materiais'), []);

  async function criar(dados) {
    await api('/placas/materiais', { method: 'POST', body: dados });
    setCriando(false);
    recarregar();
  }

  async function salvarEdicao(dados) {
    await api(`/placas/materiais/${editando.id}`, { method: 'PUT', body: dados });
    setEditando(null);
    recarregar();
  }

  async function remover(material) {
    if (!window.confirm(`Excluir o material ${material.nome}?`)) return;
    await api(`/placas/materiais/${material.id}`, { method: 'DELETE' });
    recarregar();
  }

  return (
    <section>
      <header className="pagina__topo">
        <h2>Materiais</h2>
        <button type="button" className="btn btn--primario" onClick={() => setCriando(true)}>+ Material</button>
      </header>
      <Aviso erro={erro} />
      {materiais && (materiais.length ? (
        <table className="tabela">
          <thead><tr><th>Nome</th><th className="num">Estoque atual</th><th className="num">Custo unitário atual</th><th></th></tr></thead>
          <tbody>
            {materiais.map((m) => (
              <tr key={m.id}>
                <td>{m.nome}</td>
                <td className="num">
                  {m.estoque_atual < 0 ? <span className="etiqueta etiqueta--atrasada">{m.estoque_atual}</span> : m.estoque_atual}
                </td>
                <td className="num">{m.custo_unitario_atual === null ? '—' : formatarDinheiro(m.custo_unitario_atual)}</td>
                <td>
                  <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => setEditando(m)}>Editar</button>{' '}
                  <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => remover(m)}>Excluir</button>
                </td>
              </tr>
            ))}
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
    </section>
  );
}
