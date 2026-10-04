import { useState } from 'react';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { Aviso } from '../../components/Aviso.jsx';
import { Modal } from '../../components/Modal.jsx';
import { FormPlacaModelo } from '../../components/FormPlacaModelo.jsx';
import { formatarDinheiro } from '../../lib/dinheiro.js';

export function AbaModelos() {
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState(null);
  const { dados: modelos, erro, recarregar } = useCarregar(() => api('/placas/modelos'), []);

  async function criar(dados) {
    await api('/placas/modelos', { method: 'POST', body: dados });
    setCriando(false);
    recarregar();
  }

  async function salvarEdicao(dados) {
    await api(`/placas/modelos/${editando.id}`, { method: 'PUT', body: dados });
    setEditando(null);
    recarregar();
  }

  async function remover(modelo) {
    if (!window.confirm(`Excluir o modelo ${modelo.nome}?`)) return;
    await api(`/placas/modelos/${modelo.id}`, { method: 'DELETE' });
    recarregar();
  }

  return (
    <section>
      <header className="pagina__topo">
        <h2>Modelos</h2>
        <button type="button" className="btn btn--primario" onClick={() => setCriando(true)}>+ Modelo</button>
      </header>
      <Aviso erro={erro} />
      {modelos && (modelos.length ? (
        <table className="tabela">
          <thead><tr><th>Nome</th><th className="num">Preço de venda</th><th className="num">Custo previsto</th><th className="num">Lucro previsto</th><th></th></tr></thead>
          <tbody>
            {modelos.map((m) => (
              <tr key={m.id}>
                <td>{m.nome}</td>
                <td className="num">{formatarDinheiro(m.preco_venda_centavos)}</td>
                <td className="num">{m.custo_previsto_centavos === null ? '—' : formatarDinheiro(m.custo_previsto_centavos)}</td>
                <td className="num">{m.lucro_previsto_centavos === null ? '—' : formatarDinheiro(m.lucro_previsto_centavos)}</td>
                <td>
                  <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => setEditando(m)}>Editar</button>{' '}
                  <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => remover(m)}>Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="vazio">Nenhum modelo cadastrado.</p>)}
      {criando && (
        <Modal titulo="Novo modelo" onFechar={() => setCriando(false)}>
          <FormPlacaModelo rotuloBotao="Criar modelo" onSalvar={criar} />
        </Modal>
      )}
      {editando && (
        <Modal titulo="Editar modelo" onFechar={() => setEditando(null)}>
          <FormPlacaModelo inicial={editando} rotuloBotao="Salvar" onSalvar={salvarEdicao} />
        </Modal>
      )}
    </section>
  );
}
