import { useState } from 'react';
import { NavLink } from 'react-router';
import { Icone } from './Icone.jsx';
import { alternarValoresOcultos, useValoresOcultos } from '../lib/privacidade.js';

const NAVEGACAO = [
  { para: '/', rotulo: 'Início', icone: 'inicio' },
  { para: '/clientes', rotulo: 'Clientes', icone: 'clientes' },
  { para: '/servicos', rotulo: 'Serviços', icone: 'servicos' },
  { para: '/conteudo', rotulo: 'Conteúdo', icone: 'conteudo' },
  { para: '/portfolio', rotulo: 'Portfólio', icone: 'portfolio' },
  { para: '/financeiro', rotulo: 'Financeiro', icone: 'financeiro' },
  { para: '/configuracoes', rotulo: 'Configurações', icone: 'configuracoes' },
];

// O menu fica recolhido e abre por cima do conteúdo ao passar o mouse (ou focar com o teclado).
// O botão fixa o menu aberto; a fixação não é lembrada, toda visita começa recolhida.
export function Sidebar() {
  const [fixada, setFixada] = useState(false);
  const [passando, setPassando] = useState(false);
  const aberta = fixada || passando;
  const ocultos = useValoresOcultos();
  const rotuloValores = ocultos ? 'Mostrar valores' : 'Ocultar valores';

  return (
    <nav
      className={`sidebar${aberta ? '' : ' sidebar--recolhida'}${passando && !fixada ? ' sidebar--flutuante' : ''}`}
      aria-label="Principal"
      onMouseEnter={() => setPassando(true)}
      onMouseLeave={() => setPassando(false)}
      onFocus={() => setPassando(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setPassando(false); }}
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
      <ul>
        {NAVEGACAO.map((item) => (
          <li key={item.para}>
            <NavLink to={item.para} end={item.para === '/'} title={aberta ? undefined : item.rotulo} aria-label={item.rotulo}>
              <Icone nome={item.icone} />
              <span className="sidebar__rotulo">{item.rotulo}</span>
            </NavLink>
          </li>
        ))}
      </ul>
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
    </nav>
  );
}
