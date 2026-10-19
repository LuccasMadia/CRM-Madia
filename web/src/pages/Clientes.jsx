import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { Aviso } from '../components/Aviso.jsx';
import { Modal } from '../components/Modal.jsx';
import { FormCliente } from '../components/FormCliente.jsx';
import { Icone } from '../components/Icone.jsx';

export function Clientes() {
  const [busca, setBusca] = useState('');
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState(null);
  const navegar = useNavigate();
  const { dados: clientes, erro, recarregar } = useCarregar(() => api(`/clientes?busca=${encodeURIComponent(busca)}`), [busca]);

  async function criar(dados) {
    const cliente = await api('/clientes', { method: 'POST', body: dados });
    navegar(`/clientes/${cliente.id}`);
  }

  async function salvar(dados) {
    await api(`/clientes/${editando.id}`, { method: 'PUT', body: dados });
    setEditando(null);
    recarregar();
  }

  return (
    <section>
      <header className="pagina__topo">
        <h1>Clientes</h1>
        <button type="button" className="btn btn--primario" onClick={() => setCriando(true)}>+ Cliente</button>
      </header>
      <input
        type="search"
        className="busca"
        placeholder="Buscar por empresa, responsável ou Instagram"
        aria-label="Buscar clientes"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />
      <Aviso erro={erro} />
      {clientes && (clientes.length ? (
        <table className="tabela">
          <thead><tr><th>Empresa</th><th>Responsável</th><th>Instagram</th><th>WhatsApp</th><th aria-label="Ações" /></tr></thead>
          <tbody>
            {clientes.map((c) => (
              <tr key={c.id}>
                <td><Link to={`/clientes/${c.id}`}>{c.nome || 'Sem empresa'}</Link></td>
                <td>{c.responsavel ?? '—'}</td>
                <td>{c.instagram ?? '—'}</td>
                <td>{c.telefone ?? '—'}</td>
                <td className="tabela__acoes">
                  <button
                    type="button"
                    className="btn btn--icone"
                    aria-label={`Editar ${c.nome || c.responsavel || 'cliente'}`}
                    title="Editar informações"
                    onClick={() => setEditando(c)}
                  >
                    <Icone nome="lapis" tamanho={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="vazio">Nenhum cliente encontrado.</p>)}
      {editando && (
        <Modal titulo="Editar cliente" onFechar={() => setEditando(null)}>
          <FormCliente inicial={editando} onSalvar={salvar} />
        </Modal>
      )}
      {criando && (
        <Modal titulo="Novo cliente" onFechar={() => setCriando(false)}>
          <FormCliente rotuloBotao="Criar cliente" onSalvar={criar} />
        </Modal>
      )}
    </section>
  );
}
