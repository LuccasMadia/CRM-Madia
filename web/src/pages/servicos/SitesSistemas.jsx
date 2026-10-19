import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { Aviso } from '../../components/Aviso.jsx';
import { Icone } from '../../components/Icone.jsx';
import { Modal } from '../../components/Modal.jsx';
import { FormOportunidade } from '../../components/FormOportunidade.jsx';
import { formatarDinheiro } from '../../lib/dinheiro.js';
import { ROTULO_ETAPA } from '../../lib/rotulos.js';
import { BolinhaStatus, textoStatus } from '../../lib/hospedagem.js';
import { PainelReceber } from './PainelReceber.jsx';
import { QuadroFunil } from './QuadroFunil.jsx';

// Rótulos curtos só para as pílulas do filtro.
const FILTROS_ETAPA = [
  ['', 'Ativos'],
  ['ideia', 'Ideia'],
  ['prototipo', 'Protótipo'],
  ['apresentado', 'Apresentado'],
  ['valor_definido', 'Valor definido'],
  ['teste', 'Em teste'],
  ['andamento', 'Versão final'],
  ['entregue', 'Entregue'],
  ['perdido', 'Perdidos'],
];

function Selo({ icone, rotulo }) {
  return <span className="selo-divulgacao" role="img" aria-label={rotulo} title={rotulo}><Icone nome={icone} tamanho={16} /></span>;
}

function ListaSites() {
  const navegar = useNavigate();
  const [etapa, setEtapa] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [instagram, setInstagram] = useState('');
  const consulta = new URLSearchParams(
    Object.entries({ servico: 'site_sistema', etapa, cliente_id: clienteId, postou_instagram: instagram }).filter(([, v]) => v),
  ).toString();

  const { dados: projetos, erro } = useCarregar(() => api(`/projetos${consulta ? `?${consulta}` : ''}`), [consulta]);
  const { dados: clientes } = useCarregar(() => api('/clientes'), []);
  const { dados: hospedagens } = useCarregar(() => api('/hospedagem/status'), []);
  const hospedagemDe = (id) => (hospedagens ?? []).find((h) => h.projeto_id === id);

  const lista = (projetos ?? [])
    .filter((p) => etapa || p.etapa !== 'perdido')
    .slice()
    .sort((a, b) => b.atualizado_em.localeCompare(a.atualizado_em));

  // A linha toda abre o projeto; cliques em links (título, cliente) seguem o próprio link.
  function abrirLinha(e, id) {
    if (e.target.closest('a')) return;
    navegar(`/projetos/${id}`);
  }

  return (
    <>
      <div className="filtros">
        <div className="pilulas" role="group" aria-label="Etapa">
          {FILTROS_ETAPA.map(([valor, rotulo]) => (
            <button key={rotulo} type="button" className="pilula" aria-pressed={etapa === valor} onClick={() => setEtapa(valor)}>
              {rotulo}
            </button>
          ))}
        </div>
        <div className="filtros__selects">
          <select className="select-compacto" aria-label="Cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
            <option value="">Todos os clientes</option>
            {(clientes ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <select className="select-compacto" aria-label="Instagram" value={instagram} onChange={(e) => setInstagram(e.target.value)}>
            <option value="">Instagram: todos</option>
            <option value="1">Postaram</option>
            <option value="0">Não postaram</option>
          </select>
        </div>
      </div>
      <Aviso erro={erro} />
      {projetos && (lista.length ? (
        <table className="tabela tabela--limpa">
          <thead>
            <tr><th>Projeto</th><th>Etapa</th><th>Divulgação</th><th>No ar</th><th className="num">Valor</th></tr>
          </thead>
          <tbody>
            {lista.map((p) => (
              <tr key={p.id} className="tabela__linha--clicavel" onClick={(e) => abrirLinha(e, p.id)}>
                <td>
                  <Link className="tabela__titulo" to={`/projetos/${p.id}`}>{p.titulo}</Link>
                  <Link className="tabela__sub" to={`/clientes/${p.cliente_id}`}>{p.cliente_nome}</Link>
                </td>
                <td><span className={`etapa etapa--${p.etapa}`}>{ROTULO_ETAPA[p.etapa]}</span></td>
                <td>
                  {Boolean(p.postou_instagram) && <Selo icone="instagram" rotulo="Postou no Instagram" />}
                  {Boolean(p.no_portfolio) && <Selo icone="portfolio" rotulo="No portfólio" />}
                </td>
                <td>
                  {hospedagemDe(p.id)?.tipo === 'vercel' ? (
                    <span className="status-linha">
                      <BolinhaStatus status={hospedagemDe(p.id).status} /> <span>{textoStatus(hospedagemDe(p.id))}</span>
                    </span>
                  ) : '—'}
                </td>
                <td className="num tabela__valor">{p.valor_total_centavos ? formatarDinheiro(p.valor_total_centavos) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="vazio">Nenhum projeto encontrado.</p>)}
    </>
  );
}

const CHAVE_VISAO = 'crm.sitesVisao';
const VISOES = [['lista', 'Lista'], ['funil', 'Funil']];
const ORIGENS = [['reais', 'Reais'], ['ficticios', 'Fictícios']];

function visaoSalva() {
  try {
    return localStorage.getItem(CHAVE_VISAO) === 'funil' ? 'funil' : 'lista';
  } catch {
    return 'lista';
  }
}

// O Funil é o mesmo conjunto de projetos visto em quadro; /funil e ?ver=funil abrem direto nele.
export function SitesSistemas() {
  const navegar = useNavigate();
  const [params, setParams] = useSearchParams();
  const pedida = params.get('ver');
  const visao = pedida === 'funil' || pedida === 'lista' ? pedida : visaoSalva();
  const [origem, setOrigem] = useState('reais');
  const [criando, setCriando] = useState(false);
  const ficticio = visao === 'funil' && origem === 'ficticios';

  function trocarVisao(nova) {
    try {
      localStorage.setItem(CHAVE_VISAO, nova);
    } catch {
      // sem armazenamento: a escolha vale só nesta visita
    }
    setParams({ aba: 'sites', ver: nova });
  }

  async function criar(dados) {
    const projeto = await api('/projetos', { method: 'POST', body: dados });
    navegar(`/projetos/${projeto.id}`);
  }

  return (
    <div>
      <PainelReceber servico="site_sistema" />
      <div className="barra-visao">
        <div className="segmentado" role="group" aria-label="Visão">
          {VISOES.map(([chave, rotulo]) => (
            <button key={chave} type="button" aria-pressed={visao === chave} onClick={() => trocarVisao(chave)}>{rotulo}</button>
          ))}
        </div>
        {visao === 'funil' && (
          <div role="tablist" className="pilulas" aria-label="Projetos">
            {ORIGENS.map(([chave, rotulo]) => (
              <button key={chave} role="tab" type="button" className="pilula" aria-selected={origem === chave} onClick={() => setOrigem(chave)}>
                {rotulo}
              </button>
            ))}
          </div>
        )}
        <button type="button" className="btn btn--primario barra-visao__acao" onClick={() => setCriando(true)}>+ Oportunidade</button>
      </div>
      {visao === 'funil' ? <QuadroFunil ficticio={ficticio} /> : <ListaSites />}
      {criando && (
        <Modal titulo="Nova oportunidade" onFechar={() => setCriando(false)}>
          <FormOportunidade onSalvar={criar} ficticioFixo={ficticio} />
        </Modal>
      )}
    </div>
  );
}
