import { useEffect } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router';
import { Sidebar } from './components/Sidebar.jsx';
import { BarraCarregando } from './components/Carregando.jsx';
import { Notificacoes } from './components/Notificacoes.jsx';
import { Inicio } from './pages/Inicio.jsx';
import { Clientes } from './pages/Clientes.jsx';
import { ClienteDetalhe } from './pages/ClienteDetalhe.jsx';
import { Servicos } from './pages/Servicos.jsx';
import { Projeto } from './pages/projeto/Projeto.jsx';
import { Conteudo } from './pages/Conteudo.jsx';
import { Portfolio } from './pages/Portfolio.jsx';
import { Financeiro } from './pages/Financeiro.jsx';
import { Config } from './pages/Config.jsx';
import { Orcamento } from './pages/Orcamento.jsx';
import { Tarefas } from './pages/Tarefas.jsx';
import { alternarValoresOcultos, useValoresOcultos } from './lib/privacidade.js';
import { rotularTabelas } from './lib/rotularTabelas.js';
import { manterAbasVisiveis, mostrarAbasSelecionadas } from './lib/abasVisiveis.js';

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

  useEffect(() => rotularTabelas(), []);
  useEffect(() => manterAbasVisiveis(), []);
  const { pathname, search } = useLocation();
  useEffect(() => {
    // as abas podem só aparecer depois que os dados da página chegam: confere algumas vezes
    const esperas = [50, 400, 1200].map((ms) => setTimeout(mostrarAbasSelecionadas, ms));
    return () => esperas.forEach(clearTimeout);
  }, [pathname, search]);

  return (
    <div className={`app${ocultos ? ' app--valores-ocultos' : ''}`}>
      <BarraCarregando />
      <Sidebar />
      <main className="conteudo">
        <Routes>
          <Route path="/" element={<Inicio />} />
          <Route path="/funil" element={<Navigate to="/servicos?aba=sites&ver=andamento" replace />} />
          <Route path="/servicos" element={<Servicos />} />
          <Route path="/projetos" element={<Navigate to="/servicos?aba=sites" replace />} />
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/clientes/:id" element={<ClienteDetalhe />} />
          <Route path="/placas" element={<Navigate to="/servicos?aba=placas" replace />} />
          <Route path="/projetos/:id" element={<Projeto />} />
          <Route path="/orcamentos/:id" element={<Orcamento />} />
          <Route path="/conteudo" element={<Conteudo />} />
          <Route path="/tarefas" element={<Tarefas />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/financeiro" element={<Financeiro />} />
          <Route path="/configuracoes" element={<Config />} />
          <Route path="*" element={<NaoEncontrada />} />
        </Routes>
      </main>
      <Notificacoes />
    </div>
  );
}

function NaoEncontrada() {
  return (
    <section>
      <header className="pagina__topo"><h1>Página não encontrada</h1></header>
      <p className="vazio">Esse endereço não existe no CRM.</p>
      <Link className="btn btn--primario" to="/">Voltar para o Início</Link>
    </section>
  );
}
