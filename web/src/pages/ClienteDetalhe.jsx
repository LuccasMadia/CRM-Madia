import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { useConfirmacao } from '../hooks/useConfirmacao.jsx';
import { notificar } from '../lib/notificacoes.js';
import { Aviso } from '../components/Aviso.jsx';
import { Carregando } from '../components/Carregando.jsx';
import { Modal } from '../components/Modal.jsx';
import { FormCliente } from '../components/FormCliente.jsx';
import { FotoCliente } from '../components/FotoCliente.jsx';
import { LinkInstagram } from '../components/LinkInstagram.jsx';
import { salvarFotoCliente } from '../lib/clientes.js';
import { formatarDinheiro } from '../lib/dinheiro.js';
import { AbaSites } from './cliente/AbaSites.jsx';
import { AbaGmn } from './cliente/AbaGmn.jsx';
import { AbaPlacas } from './cliente/AbaPlacas.jsx';
import { AbaOrcamentos } from './cliente/AbaOrcamentos.jsx';

// O terceiro item é o serviço contado no rótulo; Orçamentos não tem serviço, então fica sem contagem.
const ABAS = [
  ['sites', 'Sites e Sistemas', 'site_sistema'],
  ['gmn', 'Google Meu Negócio', 'google_meu_negocio'],
  ['placas', 'Placas NFC', 'placas_nfc'],
  ['orcamentos', 'Orçamentos'],
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
  const [confirmar, dialogo] = useConfirmacao();

  if (erro || erroProjetos) return <Aviso erro={erro ?? erroProjetos} />;
  if (!cliente || !projetos) return <Carregando />;

  const doServico = (servico) => projetos.filter((p) => p.servico === servico);
  // o telefone não pode quebrar no meio da linha (espaço e hífen inquebráveis)
  const telefone = cliente.telefone?.replace(/ /g, ' ').replace(/-/g, '‑');
  const contato = [cliente.responsavel, telefone, cliente.email].filter(Boolean).join(' · ');

  async function salvar(dados, fotoEscolhida) {
    await api(`/clientes/${id}`, { method: 'PUT', body: dados });
    await salvarFotoCliente(id, fotoEscolhida);
    setEditando(false);
    recarregar();
    notificar('Cliente salvo');
  }

  function excluir() {
    confirmar({
      titulo: `Excluir o cliente ${cliente.nome}?`,
      mensagem: 'Essa ação não pode ser desfeita.',
      onConfirmar: async () => {
        await api(`/clientes/${id}`, { method: 'DELETE' });
        notificar('Cliente excluído');
        navegar('/clientes');
      },
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
          {/* A foto só muda em "Editar dados". */}
          <FotoCliente cliente={cliente} tamanho={72} rotulo={`Foto de ${cliente.nome || 'cliente'}`} />
          <div>
            <p className="sobretitulo"><Link to="/clientes">Clientes</Link></p>
            <h1>{cliente.nome || 'Sem empresa'}</h1>
            {(contato || cliente.instagram) && (
              <p className="vazio">
                {contato}
                {contato && cliente.instagram && ' · '}
                {cliente.instagram && <LinkInstagram instagram={cliente.instagram} />}
              </p>
            )}
            <p>Total faturado: <strong>{formatarDinheiro(cliente.total_faturado_centavos)}</strong></p>
          </div>
        </div>
        <div>
          <button type="button" className="btn" onClick={() => setEditando(true)}>Editar dados</button>{' '}
          <button type="button" className="btn btn--perigo" onClick={excluir}>Excluir</button>
        </div>
      </header>
      <div role="tablist" className="abas">
        {ABAS.map(([chave, rotulo, servico]) => (
          <button
            key={chave} role="tab" type="button" className="abas__aba" aria-selected={aba === chave}
            onClick={() => setParams({ aba: chave })}
          >
            {servico ? `${rotulo} (${doServico(servico).length})` : rotulo}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {aba === 'sites' && <AbaSites cliente={cliente} projetos={doServico('site_sistema')} />}
        {aba === 'gmn' && <AbaGmn cliente={cliente} projetos={doServico('google_meu_negocio')} onMudou={mudou} />}
        {aba === 'placas' && <AbaPlacas cliente={cliente} projetos={doServico('placas_nfc')} onMudou={mudou} />}
        {aba === 'orcamentos' && <AbaOrcamentos cliente={cliente} />}
      </div>
      {editando && (
        <Modal titulo="Editar dados" onFechar={() => setEditando(false)}>
          <FormCliente inicial={cliente} onSalvar={salvar} />
        </Modal>
      )}
      {dialogo}
    </section>
  );
}
