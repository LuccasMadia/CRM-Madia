import { Route, Routes } from 'react-router';
import { Sidebar } from './components/Sidebar.jsx';
import { Inicio } from './pages/Inicio.jsx';
import { Funil } from './pages/Funil.jsx';
import { Projetos } from './pages/Projetos.jsx';
import { Clientes } from './pages/Clientes.jsx';
import { ClienteDetalhe } from './pages/ClienteDetalhe.jsx';
import { QRCodes } from './pages/QRCodes.jsx';
import { QRCodeDetalhe } from './pages/QRCodeDetalhe.jsx';
import { Placas } from './pages/Placas.jsx';
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
          <Route path="/projetos" element={<Projetos />} />
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/clientes/:id" element={<ClienteDetalhe />} />
          <Route path="/qrcodes" element={<QRCodes />} />
          <Route path="/qrcodes/:id" element={<QRCodeDetalhe />} />
          <Route path="/placas" element={<Placas />} />
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
