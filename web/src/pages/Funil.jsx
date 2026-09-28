import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Aviso } from '../components/Aviso.jsx';
import { Modal } from '../components/Modal.jsx';
import { Kanban } from '../components/Kanban.jsx';
import { FormOportunidade } from '../components/FormOportunidade.jsx';
import { formatarDinheiro } from '../lib/dinheiro.js';
import { formatarData } from '../lib/datas.js';
import { ETAPAS, ETAPAS_FICTICIO, ROTULO_ETAPA } from '../lib/rotulos.js';

const ABAS = [
  ['reais', 'Reais'],
  ['ficticios', 'Fictícios'],
];

export function Funil() {
  const [aba, setAba] = useState('reais');
  const ficticio = aba === 'ficticios';
  const { dados: projetos, erro, recarregar } = useCarregar(
    () => api(`/projetos?ficticio=${ficticio ? 1 : 0}`),
    [ficticio],
  );
  const [criando, setCriando] = useState(false);
  const mudanca = useEnvio();
  const navegar = useNavigate();

  const colunas = (ficticio ? ETAPAS_FICTICIO : ETAPAS).map((id) => ({ id, titulo: ROTULO_ETAPA[id] }));

  function mover(projeto, etapa) {
    mudanca.executar(async () => {
      await api(`/projetos/${projeto.id}`, { method: 'PUT', body: { etapa } });
      recarregar();
    });
  }

  async function criar(dados) {
    const projeto = await api('/projetos', { method: 'POST', body: dados });
    navegar(`/projetos/${projeto.id}`);
  }

  return (
    <section>
      <header className="pagina__topo">
        <h1>Funil</h1>
        <button type="button" className="btn btn--primario" onClick={() => setCriando(true)}>+ Oportunidade</button>
      </header>
      <div role="tablist" className="abas">
        {ABAS.map(([chave, rotulo]) => (
          <button key={chave} role="tab" type="button" className="abas__aba" aria-selected={aba === chave} onClick={() => setAba(chave)}>
            {rotulo}
          </button>
        ))}
      </div>
      <Aviso erro={erro ?? mudanca.erro} />
      {projetos && (
        <Kanban
          colunas={colunas}
          itens={projetos}
          colunaDe={(p) => p.etapa}
          tituloDe={(p) => p.titulo}
          recolhidas={ficticio ? [] : ['perdido']}
          onMover={mover}
          renderItem={(p) => (
            <>
              <Link to={`/projetos/${p.id}`} className="kanban__titulo">{p.titulo}</Link>
              <p className="kanban__meta">{p.cliente_nome}</p>
              <p className="kanban__meta">{formatarDinheiro(p.valor_total_centavos)} · prazo {formatarData(p.prazo_entrega)}</p>
            </>
          )}
        />
      )}
      {criando && (
        <Modal titulo="Nova oportunidade" onFechar={() => setCriando(false)}>
          <FormOportunidade onSalvar={criar} ficticioFixo={ficticio} />
        </Modal>
      )}
    </section>
  );
}
