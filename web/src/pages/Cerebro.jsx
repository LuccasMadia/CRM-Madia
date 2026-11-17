import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { Aviso } from '../components/Aviso.jsx';
import { Carregando } from '../components/Carregando.jsx';
import { PedeAtencao } from '../components/PedeAtencao.jsx';
import { GrafoCanvas } from './cerebro/GrafoCanvas.jsx';
import { ListaCerebro } from './cerebro/ListaCerebro.jsx';
import { PainelConteudo, PainelItem, textoDoItem } from './cerebro/PainelPonto.jsx';
import { posicionarGrafo } from './cerebro/layout.js';
import { montarVizinhos, vizinhosVisiveis } from './cerebro/ligacoes.js';
import './cerebro/cerebro.css';

// Ações dos pontos e apps por id, rótulos, quem tem posição no mapa e vizinhos: tudo o que o cartão precisa para "Ligado a".
function montarIndice(dados) {
  const { areas } = dados.memoria;
  const acoes = new Map();
  const rotulos = new Map();
  for (const area of areas) {
    for (const p of area.pontos) {
      acoes.set(p.id, { tipo: 'ponto', dados: { ...p, area: area.rotulo } });
      rotulos.set(p.id, p.rotulo);
    }
  }
  for (const app of dados.apps) {
    acoes.set(`app:${app.id}`, { tipo: 'app', dados: app });
    rotulos.set(`app:${app.id}`, app.nome);
  }
  const noMapa = new Set([...posicionarGrafo(areas).keys(), ...dados.apps.map((a) => `app:${a.id}`)]);
  return { acoes, rotulos, noMapa, vizinhos: montarVizinhos(areas.flatMap((a) => a.pontos)) };
}

const idNoMapa = ({ tipo, dados }) => (tipo === 'ponto' ? dados.id : tipo === 'app' ? `app:${dados.id}` : null);

function Legenda({ areas }) {
  return (
    <ul className="cerebro__legenda" aria-label="Legenda">
      {areas.map((a) => (
        <li key={a.id}><span className="cerebro__marca" style={{ background: `var(--area-${a.id})` }} /> {a.rotulo}</li>
      ))}
      <li><span className="cerebro__marca cerebro__marca--vivo" /> Vivo</li>
      <li><span className="cerebro__marca cerebro__marca--historico" /> Histórico</li>
      <li><span className="cerebro__marca cerebro__marca--destaque" /> Pede ação</li>
      <li><span className="cerebro__marca cerebro__marca--ativa" /> Rotina ativa</li>
      <li><span className="cerebro__marca cerebro__marca--planejada" /> Rotina planejada</li>
      <li><span className="cerebro__marca cerebro__marca--app" /> App conectado</li>
    </ul>
  );
}

// Mapa do "cérebro" da Madia: grafo em canvas com cartão do item, painel de conteúdo, lista acessível e legenda.
export function Cerebro() {
  const { dados, erro } = useCarregar(() => api('/cerebro'), []);
  const [aberto, setAberto] = useState(null);
  const [emInicio, setEmInicio] = useState(true);
  const [lista, setLista] = useState(false);
  const [legenda, setLegenda] = useState(false);
  const [aba, setAba] = useState('item');
  const grafo = useRef(null);
  const indice = useMemo(() => (dados ? montarIndice(dados) : null), [dados]);

  const abrir = useCallback((acao) => { setAberto(acao); setAba('item'); setLista(false); setLegenda(false); }, []);
  const fechar = useCallback(() => setAberto(null), []);
  const voarPara = (id) => { if (id) grafo.current?.voarParaPonto(id); };
  const escolher = (acao, id) => { abrir(acao); setLista(false); voarPara(id); };
  const irPara = (id) => { abrir(indice.acoes.get(id)); voarPara(id); };

  useEffect(() => {
    const teclar = (e) => { if (e.key === 'Escape') { setAberto(null); setLista(false); } };
    window.addEventListener('keydown', teclar);
    return () => window.removeEventListener('keydown', teclar);
  }, []);

  const texto = aberto && textoDoItem(aberto);
  const ligados = aberto?.tipo === 'ponto' ? vizinhosVisiveis(aberto.dados.id, indice.vizinhos, indice.rotulos, indice.noMapa) : [];
  const idAberto = aberto && idNoMapa(aberto);

  return (
    <section className="cerebro">
      <header className="pagina__topo"><h1>Cérebro</h1></header>
      <Aviso erro={erro} />
      {!dados && !erro && <Carregando />}
      {dados && (
        <>
          <PedeAtencao itens={dados.pede_atencao} />
          {dados.avisos.length > 0 && <Aviso erro={{ message: dados.avisos.join('\n') }} />}
          <div className="cerebro__corpo">
            <div className="cerebro__palco">
              {aberto && (
                <div className="cerebro__folha" data-aba={aba}>
                  {texto && (
                    <div className="cerebro__abas" role="group" aria-label="Partes do cartão">
                      <button type="button" aria-pressed={aba === 'item'} onClick={() => setAba('item')}>Item</button>
                      <button type="button" aria-pressed={aba === 'conteudo'} onClick={() => setAba('conteudo')}>Conteúdo</button>
                    </div>
                  )}
                  <PainelItem item={aberto} ligados={ligados} aoIrPara={irPara} aoVoar={idAberto ? () => voarPara(idAberto) : undefined} onFechar={fechar} />
                  {texto && <PainelConteudo item={aberto} />}
                </div>
              )}
              <GrafoCanvas
                ref={grafo}
                dados={dados}
                selecionado={idAberto}
                aoAbrir={abrir}
                aoFechar={fechar}
                aoMudarCamera={setEmInicio}
              />
              <span className="cerebro__canto cerebro__canto--titulo">Madia · Cérebro</span>
              {!emInicio && (
                <button type="button" className="btn cerebro__canto cerebro__canto--ver-tudo" onClick={() => grafo.current?.verTudo()}>Ver tudo</button>
              )}
              <button type="button" className="btn cerebro__canto cerebro__canto--legenda" aria-expanded={legenda} onClick={() => setLegenda((v) => !v)}>Legenda</button>
              <button type="button" className="btn cerebro__canto cerebro__canto--lista" aria-expanded={lista} onClick={() => setLista((v) => !v)}>Lista</button>
              {legenda && <Legenda areas={dados.memoria.areas} />}
              {lista && <ListaCerebro dados={dados} aoEscolher={escolher} />}
              {!dados.centro && <Link className="cerebro__configurar" to="/configuracoes">Configure a pasta do cérebro</Link>}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
