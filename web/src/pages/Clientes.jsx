import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { Aviso } from '../components/Aviso.jsx';
import { Modal } from '../components/Modal.jsx';
import { FormCliente } from '../components/FormCliente.jsx';

export function Clientes() {
  const [busca, setBusca] = useState('');
  const [criando, setCriando] = useState(false);
  const navegar = useNavigate();
  const { dados: clientes, erro } = useCarregar(() => api(`/clientes?busca=${encodeURIComponent(busca)}`), [busca]);

  async function criar(dados) {
    const cliente = await api('/clientes', { method: 'POST', body: dados });
    navegar(`/clientes/${cliente.id}`);
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
        placeholder="Buscar por nome, empresa ou email"
        aria-label="Buscar clientes"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />
      <Aviso erro={erro} />
      {clientes && (clientes.length ? (
        <table className="tabela">
          <thead><tr><th>Nome</th><th>Empresa</th><th>Email</th><th>Telefone</th></tr></thead>
          <tbody>
            {clientes.map((c) => (
              <tr key={c.id}>
                <td><Link to={`/clientes/${c.id}`}>{c.nome}</Link></td>
                <td>{c.empresa ?? '—'}</td>
                <td>{c.email ?? '—'}</td>
                <td>{c.telefone ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="vazio">Nenhum cliente encontrado.</p>)}
      {criando && (
        <Modal titulo="Novo cliente" onFechar={() => setCriando(false)}>
          <FormCliente rotuloBotao="Criar cliente" onSalvar={criar} />
        </Modal>
      )}
    </section>
  );
}
