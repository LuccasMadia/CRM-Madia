import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { useAtrasado } from '../hooks/useAtrasado.js';
import { Aviso } from '../components/Aviso.jsx';
import { Modal } from '../components/Modal.jsx';
import { FormCliente } from '../components/FormCliente.jsx';
import { Icone } from '../components/Icone.jsx';
import { FotoCliente } from '../components/FotoCliente.jsx';
import { LinkInstagram } from '../components/LinkInstagram.jsx';
import { salvarFotoCliente } from '../lib/clientes.js';
import { notificar } from '../lib/notificacoes.js';

export function Clientes() {
  const [busca, setBusca] = useState('');
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState(null);
  const navegar = useNavigate();
  const termo = useAtrasado(busca.trim());
  const { dados: clientes, erro, recarregar } = useCarregar(() => api(`/clientes?busca=${encodeURIComponent(termo)}`), [termo]);

  async function criar(dados, fotoEscolhida) {
    const cliente = await api('/clientes', { method: 'POST', body: dados });
    await salvarFotoCliente(cliente.id, fotoEscolhida);
    navegar(`/clientes/${cliente.id}`);
    notificar('Cliente criado');
  }

  async function salvar(dados, fotoEscolhida) {
    await api(`/clientes/${editando.id}`, { method: 'PUT', body: dados });
    await salvarFotoCliente(editando.id, fotoEscolhida);
    setEditando(null);
    recarregar();
    notificar('Cliente salvo');
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
                <td>
                  <span className="cliente-nome">
                    <FotoCliente cliente={c} tamanho={32} />
                    <Link to={`/clientes/${c.id}`}>{c.nome || 'Sem empresa'}</Link>
                    {c.proprio ? <span className="etiqueta etiqueta--voce">Você</span> : null}
                  </span>
                </td>
                <td>{c.responsavel ?? '—'}</td>
                <td><LinkInstagram instagram={c.instagram} /></td>
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
      ) : termo ? (
        <p className="vazio">Nenhum cliente encontrado para “{termo}”.</p>
      ) : (
        <div className="estado-vazio">
          <p className="vazio">Nenhum cliente cadastrado ainda.</p>
          <button type="button" className="btn btn--primario" onClick={() => setCriando(true)}>Cadastrar o primeiro cliente</button>
        </div>
      ))}
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
