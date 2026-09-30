import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { Aviso } from '../components/Aviso.jsx';
import { Modal } from '../components/Modal.jsx';
import { FormQRCode } from '../components/FormQRCode.jsx';
import { ROTULO_CATEGORIA_QR, ROTULO_STATUS_QR, STATUS_QR } from '../lib/rotulos.js';

export function QRCodes() {
  const [clienteId, setClienteId] = useState('');
  const [status, setStatus] = useState('');
  const [criando, setCriando] = useState(false);
  const navegar = useNavigate();
  const { dados: clientes } = useCarregar(() => api('/clientes'), []);
  const query = new URLSearchParams({
    ...(clienteId && { cliente_id: clienteId }),
    ...(status && { status }),
  }).toString();
  const { dados: qrcodes, erro } = useCarregar(() => api(`/qrcodes?${query}`), [query]);

  async function criar(dados) {
    const qrcode = await api('/qrcodes', { method: 'POST', body: dados });
    navegar(`/qrcodes/${qrcode.id}`);
  }

  function nomeCliente(clienteId) {
    return (clientes ?? []).find((c) => c.id === clienteId)?.nome ?? '—';
  }

  return (
    <section>
      <header className="pagina__topo">
        <h1>QR Codes</h1>
        <button type="button" className="btn btn--primario" onClick={() => setCriando(true)}>+ QR Code</button>
      </header>
      <div className="form--linha">
        <select aria-label="Filtrar por cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
          <option value="">Todos os clientes</option>
          {(clientes ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <select aria-label="Filtrar por status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {STATUS_QR.map((s) => <option key={s} value={s}>{ROTULO_STATUS_QR[s]}</option>)}
        </select>
      </div>
      <Aviso erro={erro} />
      {qrcodes && (qrcodes.length ? (
        <table className="tabela">
          <thead><tr><th>Nome</th><th>Cliente</th><th>Categoria</th><th>Status</th></tr></thead>
          <tbody>
            {qrcodes.map((q) => (
              <tr key={q.id}>
                <td><Link to={`/qrcodes/${q.id}`}>{q.nome}</Link></td>
                <td>{nomeCliente(q.cliente_id)}</td>
                <td>{ROTULO_CATEGORIA_QR[q.categoria]}</td>
                <td>{ROTULO_STATUS_QR[q.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="vazio">Nenhum QR code encontrado.</p>)}
      {criando && (
        <Modal titulo="Novo QR Code" onFechar={() => setCriando(false)}>
          <FormQRCode rotuloBotao="Criar QR Code" onSalvar={criar} />
        </Modal>
      )}
    </section>
  );
}
