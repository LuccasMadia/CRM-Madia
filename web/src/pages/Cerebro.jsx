import { useCallback, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { Aviso } from '../components/Aviso.jsx';
import { Carregando } from '../components/Carregando.jsx';
import { PedeAtencao } from '../components/PedeAtencao.jsx';
import { AneisCerebro } from './cerebro/AneisCerebro.jsx';
import { PainelPonto } from './cerebro/PainelPonto.jsx';
import './cerebro/cerebro.css';

// Mapa do "cérebro" da Madia: o CLAUDE.md no centro, skills, a memória (registros do CRM), rotinas e apps.
export function Cerebro() {
  const { dados, erro } = useCarregar(() => api('/cerebro'), []);
  const [aberto, setAberto] = useState(null);
  const [aproximada, setAproximada] = useState(null);
  const fechar = useCallback(() => setAberto(null), []);

  return (
    <section className="cerebro">
      <header className="pagina__topo"><h1>Cérebro</h1></header>
      <Aviso erro={erro} />
      {!dados && !erro && <Carregando />}
      {dados && (
        <>
          <PedeAtencao itens={dados.pede_atencao} />
          {dados.avisos.length > 0 && <Aviso erro={{ message: dados.avisos.join('\n') }} />}
          <div className={`cerebro__corpo${aberto ? ' cerebro__corpo--com-painel' : ''}`}>
            <div className="cerebro__palco">
              {aproximada && (
                <button type="button" className="btn cerebro__ver-tudo" onClick={() => setAproximada(null)}>Ver tudo</button>
              )}
              <div className="cerebro__anel">
                <AneisCerebro
                  dados={dados}
                  aproximada={aproximada}
                  aoAbrir={setAberto}
                  aoAproximar={setAproximada}
                  selecionado={aberto?.tipo === 'ponto' ? aberto.dados.id : aberto?.tipo === 'app' ? `app:${aberto.dados.id}` : null}
                />
                {!dados.centro && !aproximada && (
                  <Link className="cerebro__configurar" to="/configuracoes">Configure a pasta do cérebro</Link>
                )}
              </div>
              <ul className="cerebro__legenda">
                <li><span className="cerebro__marca cerebro__marca--destaque" /> Pede ação</li>
                <li><span className="cerebro__marca cerebro__marca--ativa" /> Rotina ativa</li>
                <li><span className="cerebro__marca cerebro__marca--planejada" /> Rotina planejada</li>
                <li><span className="cerebro__marca cerebro__marca--app" /> App conectado</li>
              </ul>
            </div>
            {aberto && <PainelPonto item={aberto} onFechar={fechar} />}
          </div>
        </>
      )}
    </section>
  );
}
