import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useSearchParams } from 'react-router';
import { Icone } from './Icone.jsx';
import { alternarValoresOcultos, useValoresOcultos } from '../lib/privacidade.js';

// principal: fica na barra de baixo no celular; os outros vão para o "Mais".
const NAVEGACAO = [
  { para: '/', rotulo: 'Início', icone: 'inicio', principal: true },
  { para: '/clientes', rotulo: 'Clientes', icone: 'clientes', principal: true },
  { para: '/servicos', rotulo: 'Serviços', icone: 'servicos', principal: true },
  { para: '/orcamentos', rotulo: 'Orçamentos', icone: 'orcamentos', principal: true },
  { para: '/conteudo', rotulo: 'Conteúdo', icone: 'conteudo', principal: true },
  { para: '/tarefas', rotulo: 'Tarefas', icone: 'tarefas' },
  { para: '/cerebro', rotulo: 'Cérebro', icone: 'cerebro' },
  { para: '/portfolio', rotulo: 'Portfólio', icone: 'portfolio' },
  { para: '/financeiro', rotulo: 'Financeiro', icone: 'financeiro' },
  { para: '/configuracoes', rotulo: 'Configurações', icone: 'configuracoes' },
];
const PRINCIPAIS = NAVEGACAO.filter((item) => item.principal);
const SECUNDARIOS = NAVEGACAO.filter((item) => !item.principal);

// No computador, Serviços vira um link por serviço; a página escolhe pelo ?aba= (o padrão é sites).
const servico = (aba, rotulo, icone) => ({ para: `/servicos?aba=${aba}`, aba, rotulo, icone });
const SERVICOS = [
  servico('sites', 'Sites e Sistemas', 'site'),
  servico('gmn', 'Google Meu Negócio', 'gmn'),
  servico('placas', 'Placas NFC', 'nfc'),
];

// No computador os itens ficam separados por setor, só como divisões com título.
// Setor sem rótulo (Início e Financeiro) aparece sem título.
const itemDe = (para) => NAVEGACAO.find((n) => n.para === para);
const SETORES = [
  { id: 'inicio', itens: [itemDe('/')] },
  { id: 'comercial', rotulo: 'Comercial', itens: [itemDe('/clientes'), itemDe('/orcamentos')] },
  { id: 'producao', rotulo: 'Produção', itens: [...SERVICOS, itemDe('/tarefas')] },
  { id: 'marketing', rotulo: 'Marketing', itens: [itemDe('/conteudo'), itemDe('/portfolio')] },
  { id: 'financeiro', itens: [itemDe('/financeiro')] },
  { id: 'sistema', rotulo: 'Sistema', itens: [itemDe('/cerebro'), itemDe('/configuracoes')] },
];

const CONSULTA_CELULAR = '(max-width: 760px)';
function useCelular() {
  const [celular, setCelular] = useState(() => window.matchMedia?.(CONSULTA_CELULAR).matches ?? false);
  useEffect(() => {
    const consulta = window.matchMedia?.(CONSULTA_CELULAR);
    if (!consulta) return undefined;
    const atualizar = () => setCelular(consulta.matches);
    consulta.addEventListener('change', atualizar);
    atualizar();
    return () => consulta.removeEventListener('change', atualizar);
  }, []);
  return celular;
}

// O menu fica recolhido e abre por cima do conteúdo ao passar o mouse (ou focar com o teclado).
// O botão fixa o menu aberto; a fixação não é lembrada, toda visita começa recolhida.
// No celular vira uma barra embaixo; "Mais" abre os itens secundários e o ocultar valores.
export function Sidebar() {
  const [fixada, setFixada] = useState(false);
  const [passando, setPassando] = useState(false);
  const [maisAberto, setMaisAberto] = useState(false);
  const aberta = fixada || passando;
  const ocultos = useValoresOcultos();
  const rotuloValores = ocultos ? 'Mostrar valores' : 'Ocultar valores';
  const { pathname } = useLocation();
  const secundarioAtivo = SECUNDARIOS.some((item) => pathname.startsWith(item.para));

  const celular = useCelular();
  const [params] = useSearchParams();
  const abaAtiva = SERVICOS.some((s) => s.aba === params.get('aba')) ? params.get('aba') : 'sites';

  useEffect(() => setMaisAberto(false), [pathname]);

  const dica = (item) => (aberta ? undefined : item.rotulo);
  const conteudo = (item) => (
    <>
      <Icone nome={item.icone} />
      <span className="sidebar__rotulo">{item.rotulo}</span>
    </>
  );
  const link = (item) => {
    // NavLink não enxerga o ?aba=, então o serviço ativo é marcado à mão
    const ativo = item.aba && pathname.startsWith('/servicos') && abaAtiva === item.aba;
    return (
      <li key={item.para}>
        {item.aba ? (
          <Link to={item.para} className={ativo ? 'active' : undefined} aria-current={ativo ? 'page' : undefined} title={dica(item)} aria-label={item.rotulo}>
            {conteudo(item)}
          </Link>
        ) : (
          <NavLink to={item.para} end={item.para === '/'} title={dica(item)} aria-label={item.rotulo}>
            {conteudo(item)}
          </NavLink>
        )}
      </li>
    );
  };

  const botaoValores = (
    <button
      type="button"
      className={`sidebar__valores${ocultos ? ' sidebar__valores--ativo' : ''}`}
      aria-pressed={ocultos}
      aria-label={rotuloValores}
      title={`${rotuloValores} (Ctrl+Shift+H)`}
      onClick={alternarValoresOcultos}
    >
      <Icone nome={ocultos ? 'olho-fechado' : 'olho'} />
      <span className="sidebar__rotulo">{rotuloValores}</span>
    </button>
  );

  return (
    <nav
      className={`sidebar${aberta ? '' : ' sidebar--recolhida'}${passando && !fixada ? ' sidebar--flutuante' : ''}${maisAberto ? ' sidebar--mais-aberto' : ''}`}
      aria-label="Principal"
      onMouseEnter={() => setPassando(true)}
      onMouseLeave={() => setPassando(false)}
      onFocus={() => setPassando(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setPassando(false); }}
      onKeyDown={(e) => { if (e.key === 'Escape') setMaisAberto(false); }}
    >
      <div className="sidebar__topo">
        <p className="sidebar__marca">CRM Madia</p>
        <button
          type="button"
          className="sidebar__alternar"
          aria-label={fixada ? 'Recolher menu' : 'Fixar menu aberto'}
          aria-pressed={fixada}
          title={fixada ? 'Recolher menu' : 'Fixar menu aberto'}
          onClick={() => setFixada((atual) => !atual)}
        >
          <Icone nome={fixada ? 'recolher' : 'expandir'} />
        </button>
      </div>
      {celular ? (
        <>
          <ul className="sidebar__principais">
            {PRINCIPAIS.map(link)}
            <li className="sidebar__item-mais">
              <button
                type="button"
                className={`sidebar__mais${secundarioAtivo ? ' active' : ''}`}
                aria-expanded={maisAberto}
                aria-controls="sidebar-extras"
                onClick={() => setMaisAberto((atual) => !atual)}
              >
                <Icone nome="mais" />
                <span className="sidebar__rotulo">Mais</span>
              </button>
            </li>
          </ul>
          <div className="sidebar__extras" id="sidebar-extras">
            <ul>{SECUNDARIOS.map(link)}</ul>
            {botaoValores}
          </div>
        </>
      ) : (
        <>
          <ul className="sidebar__setores">
            {SETORES.map((setor) => (
              <li key={setor.id} className="sidebar__setor">
                {setor.rotulo && <p className="sidebar__setor-titulo">{setor.rotulo}</p>}
                <ul>{setor.itens.map(link)}</ul>
              </li>
            ))}
          </ul>
          {botaoValores}
        </>
      )}
    </nav>
  );
}
