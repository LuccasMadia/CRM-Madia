import { NavLink, Route, Routes } from 'react-router';
import { Inicio } from './pages/Inicio.jsx';
import { Funil } from './pages/Funil.jsx';
import { Projetos } from './pages/Projetos.jsx';
import { Clientes } from './pages/Clientes.jsx';
import { ClienteDetalhe } from './pages/ClienteDetalhe.jsx';
import { Projeto } from './pages/projeto/Projeto.jsx';
import { Conteudo } from './pages/Conteudo.jsx';
import { Financeiro } from './pages/Financeiro.jsx';
import { Config } from './pages/Config.jsx';

const NAVEGACAO = [
  { para: '/', rotulo: 'Início' },
  { para: '/funil', rotulo: 'Funil' },
  { para: '/projetos', rotulo: 'Projetos' },
  { para: '/clientes', rotulo: 'Clientes' },
  { para: '/conteudo', rotulo: 'Conteúdo' },
  { para: '/financeiro', rotulo: 'Financeiro' },
  { para: '/configuracoes', rotulo: 'Configurações' },
];

export function App() {
  return (
    <div className="app">
      <nav className="sidebar" aria-label="Principal">
        <p className="sidebar__marca">CRM Madia</p>
        <ul>
          {NAVEGACAO.map((item) => (
            <li key={item.para}>
              <NavLink to={item.para} end={item.para === '/'}>{item.rotulo}</NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <main className="conteudo">
        <Routes>
          <Route path="/" element={<Inicio />} />
          <Route path="/funil" element={<Funil />} />
          <Route path="/projetos" element={<Projetos />} />
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/clientes/:id" element={<ClienteDetalhe />} />
          <Route path="/projetos/:id" element={<Projeto />} />
          <Route path="/conteudo" element={<Conteudo />} />
          <Route path="/financeiro" element={<Financeiro />} />
          <Route path="/configuracoes" element={<Config />} />
          <Route path="*" element={<p>Página não encontrada.</p>} />
        </Routes>
      </main>
    </div>
  );
}
