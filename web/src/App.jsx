import { NavLink, Route, Routes } from 'react-router';
import { Funil } from './pages/Funil.jsx';
import { Clientes } from './pages/Clientes.jsx';
import { ClienteDetalhe } from './pages/ClienteDetalhe.jsx';
import { Config } from './pages/Config.jsx';

const NAVEGACAO = [
  { para: '/funil', rotulo: 'Funil' },
  { para: '/clientes', rotulo: 'Clientes' },
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
          <Route path="/funil" element={<Funil />} />
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/clientes/:id" element={<ClienteDetalhe />} />
          <Route path="/configuracoes" element={<Config />} />
        </Routes>
      </main>
    </div>
  );
}
