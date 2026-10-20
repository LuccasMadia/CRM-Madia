import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { Sidebar } from './components/Sidebar.jsx';
import { Inicio } from './pages/Inicio.jsx';
import { Clientes } from './pages/Clientes.jsx';
import { ClienteDetalhe } from './pages/ClienteDetalhe.jsx';
import { Servicos } from './pages/Servicos.jsx';
import { Projeto } from './pages/projeto/Projeto.jsx';
import { Conteudo } from './pages/Conteudo.jsx';
import { Portfolio } from './pages/Portfolio.jsx';
import { Financeiro } from './pages/Financeiro.jsx';
import { Config } from './pages/Config.jsx';
import { alternarValoresOcultos, useValoresOcultos } from './lib/privacidade.js';

export function App() {
  // assinar aqui faz a tela inteira redesenhar quando o modo muda, já que todo valor passa por formatarDinheiro
  const ocultos = useValoresOcultos();

  useEffect(() => {
    function atalho(e) {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        alternarValoresOcultos();
      }
    }
    window.addEventListener('keydown', atalho);
    return () => window.removeEventListener('keydown', atalho);
  }, []);

  return (
    <div className={`app${ocultos ? ' app--valores-ocultos' : ''}`}>
      <Sidebar />
      <main className="conteudo">
        <Routes>
          <Route path="/" element={<Inicio />} />
          <Route path="/funil" element={<Navigate to="/servicos?aba=sites&ver=funil" replace />} />
          <Route path="/servicos" element={<Servicos />} />
          <Route path="/projetos" element={<Navigate to="/servicos?aba=sites" replace />} />
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/clientes/:id" element={<ClienteDetalhe />} />
          <Route path="/placas" element={<Navigate to="/servicos?aba=placas" replace />} />
          <Route path="/projetos/:id" element={<Projeto />} />
          <Route path="/conteudo" element={<Conteudo />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/financeiro" element={<Financeiro />} />
          <Route path="/configuracoes" element={<Config />} />
          <Route path="*" element={<p>Página não encontrada.</p>} />
        </Routes>
      </main>
    </div>
  );
}
