import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import { Icone } from './Icone.jsx';
import { alternarValoresOcultos, useValoresOcultos } from '../lib/privacidade.js';

// principal: fica na barra de baixo no celular; os outros vão para o "Mais".
const NAVEGACAO = [
  { para: '/', rotulo: 'Início', icone: 'inicio', principal: true },
  { para: '/clientes', rotulo: 'Clientes', icone: 'clientes', principal: true },
  { para: '/servicos', rotulo: 'Serviços', icone: 'servicos', principal: true },
  { para: '/conteudo', rotulo: 'Conteúdo', icone: 'conteudo', principal: true },
  { para: '/portfolio', rotulo: 'Portfólio', icone: 'portfolio' },
  { para: '/financeiro', rotulo: 'Financeiro', icone: 'financeiro' },
  { para: '/configuracoes', rotulo: 'Configurações', icone: 'configuracoes' },
];
const PRINCIPAIS = NAVEGACAO.filter((item) => item.principal);
const SECUNDARIOS = NAVEGACAO.filter((item) => !item.principal);

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

  useEffect(() => setMaisAberto(false), [pathname]);

  const link = (item) => (
    <li key={item.para}>
      <NavLink to={item.para} end={item.para === '/'} title={aberta ? undefined : item.rotulo} aria-label={item.rotulo}>
        <Icone nome={item.icone} />
        <span className="sidebar__rotulo">{item.rotulo}</span>
      </NavLink>
    </li>
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
      </div>
    </nav>
  );
}
