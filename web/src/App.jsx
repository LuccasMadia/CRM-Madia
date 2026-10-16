import { Navigate, Route, Routes } from 'react-router';
import { Sidebar } from './components/Sidebar.jsx';
import { Inicio } from './pages/Inicio.jsx';
import { Funil } from './pages/Funil.jsx';
import { Clientes } from './pages/Clientes.jsx';
import { ClienteDetalhe } from './pages/ClienteDetalhe.jsx';
import { Servicos } from './pages/Servicos.jsx';
import { Projeto } from './pages/projeto/Projeto.jsx';
import { Conteudo } from './pages/Conteudo.jsx';
import { Financeiro } from './pages/Financeiro.jsx';
import { Config } from './pages/Config.jsx';

export function App() {
  return (
    <div className="app">
      <Sidebar />
      <main className="conteudo">
        <Routes>
          <Route path="/" element={<Inicio />} />
          <Route path="/funil" element={<Funil />} />
          <Route path="/servicos" element={<Servicos />} />
          <Route path="/projetos" element={<Navigate to="/servicos?aba=sites" replace />} />
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/clientes/:id" element={<ClienteDetalhe />} />
          <Route path="/placas" element={<Navigate to="/servicos?aba=placas" replace />} />
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
