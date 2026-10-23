import { useState } from 'react';
import { useParcelas, parcelaUnica } from '../../hooks/useParcelas.js';
import { useAcoesGmn } from '../../hooks/useAcoesGmn.js';
import { Aviso } from '../../components/Aviso.jsx';
import { Modal } from '../../components/Modal.jsx';
import { FormGmn } from '../../components/FormGmn.jsx';
import { formatarData } from '../../lib/datas.js';
import { CobrancaServico } from './CobrancaServico.jsx';

function CartaoGmn({ clienteId, projeto, onMudou }) {
  const { parcelas, recarregar } = useParcelas(projeto);
  const [editando, setEditando] = useState(false);
  const { envio, dialogo, marcarConfigurado, excluir, salvar } = useAcoesGmn(onMudou);

  return (
    <li className="cartao" style={{ display: 'block' }}>
      <p>
        {projeto.etapa === 'entregue'
          ? <span className="etiqueta etiqueta--entregue">{`Configurado em ${formatarData(projeto.data_entrega)}`}</span>
          : <>
              <span className="etiqueta etiqueta--andamento">Pendente</span>{' '}
              <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => marcarConfigurado(projeto)}>Marcar configurado</button>
            </>}
      </p>
      {projeto.link_perfil && <p><a href={projeto.link_perfil} target="_blank" rel="noreferrer">{projeto.link_perfil}</a></p>}
      <p><CobrancaServico projeto={projeto} parcelas={parcelas} onPago={() => { recarregar(); onMudou(); }} /></p>
      {projeto.notas && <p className="vazio">{projeto.notas}</p>}
      <p>
        <button type="button" className="btn" onClick={() => setEditando(true)}>Editar</button>{' '}
        <button type="button" className="btn btn--perigo" onClick={() => excluir(projeto)}>Excluir</button>
      </p>
      <Aviso erro={envio.erro} />
      {editando && (
        <Modal titulo="Editar Google Meu Negócio" onFechar={() => setEditando(false)}>
          <FormGmn clienteId={clienteId} projeto={projeto} parcela={parcelaUnica(parcelas)} onSalvar={(corpo) => salvar(projeto, corpo, () => setEditando(false))} />
        </Modal>
      )}
      {dialogo}
    </li>
  );
}

export function AbaGmn({ cliente, projetos, onMudou }) {
  const [criando, setCriando] = useState(false);
  const { criar } = useAcoesGmn(onMudou);

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
          <FormGmn clienteId={cliente.id} onSalvar={(corpo) => criar(corpo, () => setCriando(false))} />
        </Modal>
      )}
    </div>
  );
}
