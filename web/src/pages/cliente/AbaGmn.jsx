import { useState } from 'react';
import { api } from '../../api/client.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { useParcelas, parcelaUnica } from '../../hooks/useParcelas.js';
import { useConfirmacao } from '../../hooks/useConfirmacao.jsx';
import { notificar } from '../../lib/notificacoes.js';
import { Aviso } from '../../components/Aviso.jsx';
import { Modal } from '../../components/Modal.jsx';
import { FormGmn } from '../../components/FormGmn.jsx';
import { formatarData } from '../../lib/datas.js';
import { CobrancaServico } from './CobrancaServico.jsx';

function CartaoGmn({ clienteId, projeto, onMudou }) {
  const { parcelas, recarregar } = useParcelas(projeto);
  const [editando, setEditando] = useState(false);
  const envio = useEnvio();
  const [confirmar, dialogo] = useConfirmacao();

  function marcarConfigurado() {
    envio.executar(async () => {
      await api(`/projetos/${projeto.id}`, { method: 'PUT', body: { etapa: 'entregue' } });
      onMudou();
    });
  }

  function excluir() {
    confirmar({
      titulo: 'Excluir Google Meu Negócio?',
      mensagem: 'As parcelas dele também serão excluídas.',
      onConfirmar: async () => {
        await api(`/projetos/${projeto.id}`, { method: 'DELETE' });
        notificar('Google Meu Negócio excluído');
        onMudou();
      },
    });
  }

  async function salvar(corpo) {
    await api(`/projetos/${projeto.id}`, { method: 'PUT', body: corpo });
    setEditando(false);
    onMudou();
    notificar('Google Meu Negócio salvo');
  }

  return (
    <li className="cartao" style={{ display: 'block' }}>
      <p>
        {projeto.etapa === 'entregue'
          ? <span className="etiqueta etiqueta--entregue">{`Configurado em ${formatarData(projeto.data_entrega)}`}</span>
          : <>
              <span className="etiqueta etiqueta--andamento">Pendente</span>{' '}
              <button type="button" className="btn btn--fantasma btn--pequeno" onClick={marcarConfigurado}>Marcar configurado</button>
            </>}
      </p>
      {projeto.link_perfil && <p><a href={projeto.link_perfil} target="_blank" rel="noreferrer">{projeto.link_perfil}</a></p>}
      <p><CobrancaServico projeto={projeto} parcelas={parcelas} onPago={() => { recarregar(); onMudou(); }} /></p>
      {projeto.notas && <p className="vazio">{projeto.notas}</p>}
      <p>
        <button type="button" className="btn" onClick={() => setEditando(true)}>Editar</button>{' '}
        <button type="button" className="btn btn--perigo" onClick={excluir}>Excluir</button>
      </p>
      <Aviso erro={envio.erro} />
      {editando && (
        <Modal titulo="Editar Google Meu Negócio" onFechar={() => setEditando(false)}>
          <FormGmn clienteId={clienteId} projeto={projeto} parcela={parcelaUnica(parcelas)} onSalvar={salvar} />
        </Modal>
      )}
      {dialogo}
    </li>
  );
}

export function AbaGmn({ cliente, projetos, onMudou }) {
  const [criando, setCriando] = useState(false);

  async function criar(corpo) {
    await api('/projetos', { method: 'POST', body: corpo });
    setCriando(false);
    onMudou();
    notificar('Google Meu Negócio criado');
  }

  return (
    <div>
      <div className="pagina__topo">
        <h2>Google Meu Negócio</h2>
        <button type="button" className="btn btn--primario" onClick={() => setCriando(true)}>+ Google Meu Negócio</button>
      </div>
      {projetos.length ? (
        <ul className="lista">
          {projetos.map((p) => <CartaoGmn key={p.id} clienteId={cliente.id} projeto={p} onMudou={onMudou} />)}
        </ul>
      ) : <p className="vazio">Nenhum Google Meu Negócio ainda.</p>}
      {criando && (
        <Modal titulo="Novo Google Meu Negócio" onFechar={() => setCriando(false)}>
          <FormGmn clienteId={cliente.id} onSalvar={criar} />
        </Modal>
      )}
    </div>
  );
}
