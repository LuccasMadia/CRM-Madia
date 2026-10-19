import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Aviso } from '../components/Aviso.jsx';
import { Modal } from '../components/Modal.jsx';
import { FormCliente } from '../components/FormCliente.jsx';
import { FotoCliente } from '../components/FotoCliente.jsx';
import { formatarDinheiro } from '../lib/dinheiro.js';
import { AbaSites } from './cliente/AbaSites.jsx';
import { AbaGmn } from './cliente/AbaGmn.jsx';
import { AbaPlacas } from './cliente/AbaPlacas.jsx';

const ABAS = [
  ['sites', 'Sites e Sistemas', 'site_sistema'],
  ['gmn', 'Google Meu Negócio', 'google_meu_negocio'],
  ['placas', 'Placas NFC', 'placas_nfc'],
];

export function ClienteDetalhe() {
  const { id } = useParams();
  const navegar = useNavigate();
  const [params, setParams] = useSearchParams();
  const aba = ABAS.some(([chave]) => chave === params.get('aba')) ? params.get('aba') : 'sites';
  const { dados: cliente, erro, recarregar } = useCarregar(() => api(`/clientes/${id}`), [id]);
  const { dados: projetos, erro: erroProjetos, recarregar: recarregarProjetos } = useCarregar(
    () => api(`/projetos?cliente_id=${id}`), [id],
  );
  const [editando, setEditando] = useState(false);
  const exclusao = useEnvio();
  const foto = useEnvio();

  if (erro || erroProjetos) return <Aviso erro={erro ?? erroProjetos} />;
  if (!cliente || !projetos) return <p>Carregando…</p>;

  const doServico = (servico) => projetos.filter((p) => p.servico === servico);
  const contato = [cliente.responsavel, cliente.telefone, cliente.email, cliente.instagram].filter(Boolean).join(' · ');

  async function salvar(dados) {
    await api(`/clientes/${id}`, { method: 'PUT', body: dados });
    setEditando(false);
    recarregar();
  }

  function excluir() {
    if (!window.confirm(`Excluir o cliente ${cliente.nome}?`)) return;
    exclusao.executar(async () => {
      await api(`/clientes/${id}`, { method: 'DELETE' });
      navegar('/clientes');
    });
  }

  function enviarFoto(e) {
    const arquivo = e.target.files?.[0];
    e.target.value = ''; // permite escolher o mesmo arquivo de novo
    if (!arquivo) return;
    const corpo = new FormData();
    corpo.append('foto', arquivo);
    foto.executar(async () => {
      await api(`/clientes/${id}/foto`, { method: 'POST', body: corpo });
      recarregar();
    });
  }

  function removerFoto() {
    if (!window.confirm('Remover a foto deste cliente?')) return;
    foto.executar(async () => {
      await api(`/clientes/${id}/foto`, { method: 'DELETE' });
      recarregar();
    });
  }

  function mudou() {
    recarregar();
    recarregarProjetos();
  }

  return (
    <section>
      <header className="pagina__topo">
        <div className="perfil-cliente">
          <div className="perfil-cliente__foto">
            <FotoCliente cliente={cliente} tamanho={72} rotulo={`Foto de ${cliente.nome || 'cliente'}`} />
            <label className="perfil-cliente__trocar">
              {cliente.foto ? 'Trocar' : 'Enviar foto'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                aria-label={cliente.foto ? 'Trocar foto' : 'Enviar foto'}
                onChange={enviarFoto}
              />
            </label>
            {cliente.foto && <button type="button" className="perfil-cliente__remover" onClick={removerFoto}>Remover foto</button>}
          </div>
          <div>
            <p className="sobretitulo"><Link to="/clientes">Clientes</Link></p>
            <h1>{cliente.nome || 'Sem empresa'}</h1>
            {contato && <p className="vazio">{contato}</p>}
            <p>Total faturado: <strong>{formatarDinheiro(cliente.total_faturado_centavos)}</strong></p>
          </div>
        </div>
        <div>
          <button type="button" className="btn" onClick={() => setEditando(true)}>Editar dados</button>{' '}
          <button type="button" className="btn btn--perigo" onClick={excluir}>Excluir</button>
        </div>
      </header>
      <Aviso erro={exclusao.erro ?? foto.erro} />
      <div role="tablist" className="abas">
        {ABAS.map(([chave, rotulo, servico]) => (
          <button
            key={chave} role="tab" type="button" className="abas__aba" aria-selected={aba === chave}
            onClick={() => setParams({ aba: chave })}
          >
            {`${rotulo} (${doServico(servico).length})`}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {aba === 'sites' && <AbaSites cliente={cliente} projetos={doServico('site_sistema')} />}
        {aba === 'gmn' && <AbaGmn cliente={cliente} projetos={doServico('google_meu_negocio')} onMudou={mudou} />}
        {aba === 'placas' && <AbaPlacas cliente={cliente} projetos={doServico('placas_nfc')} onMudou={mudou} />}
      </div>
      {editando && (
        <Modal titulo="Editar dados" onFechar={() => setEditando(false)}>
          <FormCliente inicial={cliente} onSalvar={salvar} />
        </Modal>
      )}
    </section>
  );
}
