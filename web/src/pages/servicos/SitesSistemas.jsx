import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { Aviso } from '../../components/Aviso.jsx';
import { Icone } from '../../components/Icone.jsx';
import { Modal } from '../../components/Modal.jsx';
import { EtiquetasCategorias, FiltroCategorias, temCategoria } from '../../components/CategoriaSite.jsx';
import { PedeAtencao } from '../../components/PedeAtencao.jsx';
import { FormOportunidade } from '../../components/FormOportunidade.jsx';
import { formatarDinheiro } from '../../lib/dinheiro.js';
import { hojeISO } from '../../lib/datas.js';
import { ROTULO_ETAPA } from '../../lib/rotulos.js';
import { BolinhaStatus, textoStatus } from '../../lib/hospedagem.js';
import { QuadroFunil } from './QuadroFunil.jsx';
import { itensAtencaoSites } from './atencaoSites.js';
import { notificar } from '../../lib/notificacoes.js';

function Selo({ icone, rotulo }) {
  return <span className="selo-divulgacao" role="img" aria-label={rotulo} title={rotulo}><Icone nome={icone} tamanho={16} /></span>;
}

// Só a situação, sem as ações: cobrar e marcar paga ficam em Financeiro › Mensalidades.
function Mensalidade({ item }) {
  if (!item) return <span className="vazio">—</span>;
  const valor = <span className="tabela__sub">{formatarDinheiro(item.mensalidade_valor_centavos)}/mês</span>;
  if (item.situacao === 'atrasada') return <><span className="etiqueta etiqueta--atrasada">Atrasada</span>{valor}</>;
  if (item.situacao === 'aguardando') return <><span className="etiqueta etiqueta--proposta">Ainda não começou</span>{valor}</>;
  if (item.situacao === 'desligada') return <span className="etiqueta">Desligada</span>;
  return <><span className="etiqueta etiqueta--paga">Em dia</span>{valor}</>;
}

// "No ar" é o que já está com o cliente: entregues e a versão final já publicada.
// Protótipo publicado é só prévia para apresentar, não conta.
const estaNoAr = (p, hospedagem) => p.etapa === 'entregue' || (['andamento', 'teste'].includes(p.etapa) && hospedagem?.tipo === 'vercel');

// Filtros da visão No ar; ficam na própria barra da visão para não abrir mais uma linha.
function FiltrosNoAr({ filtros: { clienteId, instagram }, onMudar }) {
  const { dados: clientes } = useCarregar(() => api('/clientes'), []);
  return (
    <>
      <select className="select-compacto" aria-label="Cliente" value={clienteId} onChange={(e) => onMudar({ clienteId: e.target.value })}>
        <option value="">Todos os clientes</option>
        {(clientes ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </select>
      <select className="select-compacto" aria-label="Instagram" value={instagram} onChange={(e) => onMudar({ instagram: e.target.value })}>
        <option value="">Instagram: todos</option>
        <option value="1">Postaram</option>
        <option value="0">Não postaram</option>
      </select>
    </>
  );
}

// Qual grupo a lista mostra: reais, privados (uso interno) ou fictícios (cases do portfólio).
const NO_GRUPO = {
  reais: (p) => !p.ficticio,
  privados: (p) => Boolean(p.privado),
  ficticios: (p) => Boolean(p.ficticio) && !p.privado,
};

function ListaNoAr({ modo, filtros: { clienteId, instagram, categoriaId }, hospedagens, mensalidades }) {
  const navegar = useNavigate();
  const consulta = new URLSearchParams(
    Object.entries({ servico: 'site_sistema', cliente_id: clienteId, postou_instagram: instagram }).filter(([, v]) => v),
  ).toString();
  const { dados: projetos, erro } = useCarregar(() => api(`/projetos?${consulta}`), [consulta]);
  const hospedagemDe = (id) => (hospedagens ?? []).find((h) => h.projeto_id === id);
  const mensalidadeDe = (id) => (mensalidades ?? []).find((m) => m.projeto_id === id);

  const lista = (projetos ?? [])
    .filter((p) => estaNoAr(p, hospedagemDe(p.id)) && temCategoria(p, categoriaId) && (NO_GRUPO[modo] ?? NO_GRUPO.reais)(p))
    .sort((a, b) => (b.data_entrega ?? '9999').localeCompare(a.data_entrega ?? '9999') || b.atualizado_em.localeCompare(a.atualizado_em));

  // A linha toda abre o projeto; cliques em links (título, cliente) seguem o próprio link.
  function abrirLinha(e, id) {
    if (e.target.closest('a')) return;
    navegar(`/projetos/${id}`);
  }

  return (
    <>
      <Aviso erro={erro} />
      {projetos && (lista.length ? (
        <table className="tabela tabela--limpa tabela--no-ar">
          <thead>
            <tr><th>Projeto</th><th>Hospedagem</th><th>Mensalidade</th><th>Divulgação</th><th className="num">Valor</th></tr>
          </thead>
          <tbody>
            {lista.map((p) => {
              const hospedagem = hospedagemDe(p.id);
              return (
                <tr key={p.id} className="tabela__linha--clicavel" onClick={(e) => abrirLinha(e, p.id)}>
                  <td>
                    <Link className="tabela__titulo" to={`/projetos/${p.id}`}>{p.titulo}</Link>
                    <EtiquetasCategorias categorias={p.categorias} />
                    <Link className="tabela__sub" to={`/clientes/${p.cliente_id}`}>{p.cliente_nome}</Link>
                    {p.etapa !== 'entregue' && <span className={`etapa etapa--${p.etapa}`}>{`Ainda em ${ROTULO_ETAPA[p.etapa].toLowerCase()}`}</span>}
                  </td>
                  <td>
                    {hospedagem?.tipo === 'vercel' ? (
                      <span className="status-linha">
                        <BolinhaStatus status={hospedagem.status} /> <span>{textoStatus(hospedagem)}</span>
                      </span>
                    ) : <span className="vazio">{hospedagem?.tipo === 'sem_hospedagem' ? 'Fica com o cliente' : '—'}</span>}
                  </td>
                  <td><Mensalidade item={mensalidadeDe(p.id)} /></td>
                  <td>
                    {Boolean(p.postou_instagram) && <Selo icone="instagram" rotulo="Postou no Instagram" />}
                    {Boolean(p.no_portfolio) && <Selo icone="portfolio" rotulo="No portfólio" />}
                    {Boolean(p.privado) && <span className="etiqueta">Privado</span>}
                    {Boolean(p.ficticio) && !p.privado && <span className="etiqueta">Fictício</span>}
                  </td>
                  <td className="num tabela__valor">{p.valor_total_centavos ? formatarDinheiro(p.valor_total_centavos) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : <p className="vazio">Nenhum site no ar por aqui.</p>)}
    </>
  );
}

const CHAVE_LAYOUT = 'crm.sitesLayout';
const LAYOUTS = [['colunas', 'Colunas'], ['linhas', 'Linhas']];
function layoutSalvo() {
  try {
    return localStorage.getItem(CHAVE_LAYOUT) === 'linhas' ? 'linhas' : 'colunas';
  } catch {
    return 'colunas';
  }
}

const CHAVE_VISAO = 'crm.sitesVisao';
// O id 'andamento' fica na URL e nas escolhas salvas; o rótulo é "Funil" para não confundir com a etapa "Versão final".
const VISOES = [['andamento', 'Funil'], ['no_ar', 'No ar']];
// Links e escolhas salvas antes da divisão por momento: o funil virou "Em andamento" e a lista, "No ar".
const VISOES_ANTIGAS = { funil: 'andamento', lista: 'no_ar' };
const MODOS = [['reais', 'Reais'], ['privados', 'Privados'], ['ficticios', 'Fictícios'], ['perdidos', 'Perdidos']];

const lerVisao = (valor) => {
  const visao = VISOES_ANTIGAS[valor] ?? valor;
  return VISOES.some(([chave]) => chave === visao) ? visao : null;
};

function visaoSalva() {
  try {
    return lerVisao(localStorage.getItem(CHAVE_VISAO)) ?? 'andamento';
  } catch {
    return 'andamento';
  }
}

// Sites e Sistemas divididos pelo momento do projeto: em andamento (quadro) ou já no ar (lista).
// /funil e ?ver=funil abrem direto no quadro.
export function SitesSistemas() {
  const navegar = useNavigate();
  const [params, setParams] = useSearchParams();
  const visao = lerVisao(params.get('ver')) ?? visaoSalva();
  const [modo, setModo] = useState('reais');
  const [layout, setLayout] = useState(layoutSalvo);
  function trocarLayout(novo) {
    setLayout(novo);
    try {
      localStorage.setItem(CHAVE_LAYOUT, novo);
    } catch {
      // sem armazenamento: a escolha vale só nesta visita
    }
  }
  const [filtros, setFiltros] = useState({ clienteId: '', instagram: '', categoriaId: '' });
  const [criando, setCriando] = useState(false);
  // "Perdidos" só existe no quadro; na lista No ar volta para Reais
  const modoAtual = visao === 'andamento' || modo !== 'perdidos' ? modo : 'reais';
  const ficticio = modoAtual === 'ficticios' || modoAtual === 'privados';
  const privado = modoAtual === 'privados';

  const categorias = useCarregar(() => api('/categorias'), []);
  const projetos = useCarregar(() => api('/projetos?servico=site_sistema&ficticio=0'), []);
  const parcelas = useCarregar(() => api('/parcelas?servico=site_sistema'), []);
  const hospedagens = useCarregar(() => api('/hospedagem/status'), []);
  const mensalidades = useCarregar(() => api('/financeiro/mensalidades'), []);
  const fontes = [projetos, parcelas, hospedagens, mensalidades];
  // Uma fonte que falhou só deixa de gerar aviso; a faixa espera as outras terminarem.
  const atencao = fontes.every((f) => f.dados || f.erro)
    ? itensAtencaoSites({
      projetos: projetos.dados ?? [],
      parcelas: parcelas.dados ?? [],
      hospedagens: hospedagens.dados ?? [],
      mensalidades: mensalidades.dados?.itens ?? [],
      hoje: hojeISO(),
    })
    : null;

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
    notificar('Projeto criado');
  }

  return (
    <div>
      <PedeAtencao itens={atencao} />
      <Aviso erro={fontes.find((f) => f.erro)?.erro} />
      <div className="barra-visao">
        <div className="segmentado" role="group" aria-label="Visão">
          {VISOES.map(([chave, rotulo]) => (
            <button key={chave} type="button" aria-pressed={visao === chave} onClick={() => trocarVisao(chave)}>{rotulo}</button>
          ))}
        </div>
        <div className="barra-visao__filtros">
          <select className="select-compacto" aria-label="Mostrar" value={modoAtual} onChange={(e) => setModo(e.target.value)}>
            {MODOS.filter(([chave]) => visao === 'andamento' || chave !== 'perdidos').map(([chave, rotulo]) => <option key={chave} value={chave}>{rotulo}</option>)}
          </select>
          {visao === 'andamento' && (
            <div className="segmentado" role="group" aria-label="Formato do quadro">
              {LAYOUTS.map(([chave, rotulo]) => (
                <button key={chave} type="button" aria-pressed={layout === chave} onClick={() => trocarLayout(chave)}>{rotulo}</button>
              ))}
            </div>
          )}
          {visao !== 'andamento' && <FiltrosNoAr filtros={filtros} onMudar={(mudou) => setFiltros((f) => ({ ...f, ...mudou }))} />}
        </div>
        <button type="button" className="btn btn--primario barra-visao__acao" onClick={() => setCriando(true)}>+ Oportunidade</button>
      </div>
      <FiltroCategorias categorias={categorias.dados} valor={filtros.categoriaId} onMudar={(categoriaId) => setFiltros((f) => ({ ...f, categoriaId }))} />
      {visao === 'andamento'
        ? <QuadroFunil layout={layout} modo={modoAtual} categoriaId={filtros.categoriaId} onMudou={projetos.recarregar} />
        : <ListaNoAr modo={modoAtual} filtros={filtros} hospedagens={hospedagens.dados} mensalidades={mensalidades.dados?.itens} />}
      {criando && (
        <Modal titulo="Nova oportunidade" onFechar={() => setCriando(false)}>
          <FormOportunidade onSalvar={criar} ficticioFixo={ficticio} privadoFixo={privado} />
        </Modal>
      )}
    </div>
  );
}
