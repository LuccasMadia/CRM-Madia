import { useState } from 'react';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { Aviso } from '../../components/Aviso.jsx';
import { Modal } from '../../components/Modal.jsx';
import { FormPlacaMontagem } from '../../components/FormPlacaMontagem.jsx';
import { formatarData } from '../../lib/datas.js';

export function AvisoEstoqueMontagem({ avisos }) {
  if (!avisos.length) return null;
  return (
    <p className="aviso aviso--erro" role="alert">
      Estoque negativo após esta montagem: {avisos.map((a) => `${a.nome} (${a.estoque_atual})`).join(', ')}
    </p>
  );
}

export function AbaMontagem() {
  const [criando, setCriando] = useState(false);
  const [avisosEstoque, setAvisosEstoque] = useState([]);
  const { dados: montagens, erro, recarregar } = useCarregar(() => api('/placas/montagens'), []);
  const envio = useEnvio();

  async function criar(dados) {
    const res = await api('/placas/montagens', { method: 'POST', body: dados });
    setCriando(false);
    setAvisosEstoque(res.avisos_estoque ?? []);
    recarregar();
  }

  function remover(montagem) {
    if (!window.confirm(`Excluir esta montagem de ${montagem.quantidade} × ${montagem.modelo_nome}? Os materiais voltam para o estoque.`)) return;
    envio.executar(async () => {
      await api(`/placas/montagens/${montagem.id}`, { method: 'DELETE' });
      recarregar();
    });
  }

  return (
    <section>
      <header className="pagina__topo">
        <h2>Montagem</h2>
        <button type="button" className="btn btn--primario" onClick={() => setCriando(true)}>+ Montar</button>
      </header>
      <Aviso erro={erro ?? envio.erro} />
      <AvisoEstoqueMontagem avisos={avisosEstoque} />
      {montagens && (montagens.length ? (
        <table className="tabela">
          <thead>
            <tr><th>Data</th><th>Modelo</th><th className="num">Qtd.</th><th>Materiais (por placa)</th><th></th></tr>
          </thead>
          <tbody>
            {montagens.map((m) => (
              <tr key={m.id}>
                <td>{formatarData(m.data_montagem)}</td>
                <td>{m.modelo_nome}</td>
                <td className="num">{m.quantidade}</td>
                <td>{m.itens.map((i) => `${i.quantidade} × ${i.material_nome}`).join(', ')}</td>
                <td><button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => remover(m)}>Excluir</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="vazio">Nenhuma montagem lançada ainda.</p>)}
      {criando && (
        <Modal titulo="Montar placas" onFechar={() => setCriando(false)}>
          <FormPlacaMontagem onSalvar={criar} />
        </Modal>
      )}
    </section>
  );
}
