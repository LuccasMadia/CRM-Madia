import { useState } from 'react';
import { NavLink } from 'react-router';
import { Icone } from './Icone.jsx';

const NAVEGACAO = [
  { para: '/', rotulo: 'Início', icone: 'inicio' },
  { para: '/funil', rotulo: 'Funil', icone: 'funil' },
  { para: '/clientes', rotulo: 'Clientes', icone: 'clientes' },
  { para: '/servicos', rotulo: 'Serviços', icone: 'servicos' },
  { para: '/conteudo', rotulo: 'Conteúdo', icone: 'conteudo' },
  { para: '/financeiro', rotulo: 'Financeiro', icone: 'financeiro' },
  { para: '/configuracoes', rotulo: 'Configurações', icone: 'configuracoes' },
];

const CHAVE_RECOLHIDA = 'crm.sidebarRecolhida';

function lerRecolhida() {
  try {
    return localStorage.getItem(CHAVE_RECOLHIDA) === '1';
  } catch {
    return false;
  }
}

function gravarRecolhida(valor) {
  try {
    localStorage.setItem(CHAVE_RECOLHIDA, valor ? '1' : '0');
  } catch {
    // sem armazenamento (navegação privada etc.): a escolha só vale nesta visita
  }
}

export function Sidebar() {
  const [recolhida, setRecolhida] = useState(lerRecolhida);

  function alternar() {
    setRecolhida((atual) => {
      gravarRecolhida(!atual);
      return !atual;
    });
  }

  return (
    <nav className={`sidebar${recolhida ? ' sidebar--recolhida' : ''}`} aria-label="Principal">
      <div className="sidebar__topo">
        <p className="sidebar__marca">CRM Madia</p>
        <button
          type="button"
          className="sidebar__alternar"
          aria-label={recolhida ? 'Expandir menu' : 'Recolher menu'}
          aria-expanded={!recolhida}
          title={recolhida ? 'Expandir menu' : 'Recolher menu'}
          onClick={alternar}
        >
          <Icone nome={recolhida ? 'expandir' : 'recolher'} />
        </button>
      </div>
      <ul>
        {NAVEGACAO.map((item) => (
          <li key={item.para}>
            <NavLink to={item.para} end={item.para === '/'} title={recolhida ? item.rotulo : undefined} aria-label={item.rotulo}>
              <Icone nome={item.icone} />
              <span className="sidebar__rotulo">{item.rotulo}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
