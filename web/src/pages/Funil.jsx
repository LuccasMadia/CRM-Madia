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
import { ETAPAS, ROTULO_ETAPA } from '../lib/rotulos.js';

const COLUNAS = ETAPAS.map((id) => ({ id, titulo: ROTULO_ETAPA[id] }));

export function Funil() {
  const { dados: projetos, erro, recarregar } = useCarregar(() => api('/projetos'), []);
  const [criando, setCriando] = useState(false);
  const mudanca = useEnvio();
  const navegar = useNavigate();

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
      <Aviso erro={erro ?? mudanca.erro} />
      {projetos && (
        <Kanban
          colunas={COLUNAS}
          itens={projetos}
          colunaDe={(p) => p.etapa}
          tituloDe={(p) => p.titulo}
          recolhidas={['perdido']}
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
          <FormOportunidade onSalvar={criar} />
        </Modal>
      )}
    </section>
  );
}
