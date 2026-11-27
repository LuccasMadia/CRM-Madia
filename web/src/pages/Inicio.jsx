import { lazy, Suspense, useState } from 'react';
import { Icone } from '../components/Icone.jsx';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { Aviso } from '../components/Aviso.jsx';
import { Carregando } from '../components/Carregando.jsx';
import { AvisosPublicacao } from '../components/AvisosPublicacao.jsx';
import { AvisosSites } from '../components/AvisosSites.jsx';
import { PedeAtencao } from '../components/PedeAtencao.jsx';
import { AvisosConexoes } from '../components/AvisosConexoes.jsx';
import { Link } from 'react-router';
import { CartaoGrafico } from '../components/graficos/CartaoGrafico.jsx';
import { Funil } from '../components/graficos/Funil.jsx';
import { formatarDinheiro } from '../lib/dinheiro.js';
import { TodoInicio } from './inicio/TodoInicio.jsx';
import { FollowUps, ParaEntregar, Divulgacao, AgendaDoDia } from './inicio/ResumoDia.jsx';

// Recharts só é baixado quando a Início abre.
const GraficoRosca = lazy(() => import('../components/graficos/GraficoRosca.jsx').then((m) => ({ default: m.GraficoRosca })));

const dataDeHoje = () => new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

function Graficos() {
  const { dados, erro } = useCarregar(() => api('/painel/graficos'), []);
  if (erro) return <Aviso erro={erro} />;
  if (!dados) return <Carregando texto="Carregando gráficos…" />;
  const { funil, origens } = dados;

  // faturamento e recebido por mês ficam no Financeiro › Visão geral
  return (
    <div className="grade-graficos">
      <CartaoGrafico titulo="Funil de oportunidades" subtitulo="sites e sistemas" vazio={funil.etapas[0].quantidade === 0}>
        <Funil etapas={funil.etapas} perdidos={funil.perdidos} />
      </CartaoGrafico>
      <CartaoGrafico titulo="De onde vêm os clientes" vazio={origens.total === 0}>
        <Suspense fallback={<Carregando />}>
          <GraficoRosca fatias={origens.fatias} total={origens.total} />
        </Suspense>
      </CartaoGrafico>
    </div>
  );
}

export function Inicio() {
  const [aberto, setAberto] = useState(false);
  const { dados, erro } = useCarregar(() => api('/painel'), []);
  if (erro) return <Aviso erro={erro} />;
  if (!dados) return <Carregando />;
  const { cartoes, tarefas_abertas: tarefas, pede_atencao: pedeAtencao, follow_ups: followUps, divulgacao = [], para_entregar: paraEntregar = { gmn: 0, placas: 0, itens: [] } } = dados;
  const { atrasadas, em_andamento_detalhe: detalhe, propostas } = cartoes;
  const previsto = cartoes.recebido_mes_centavos + cartoes.a_receber_mes_centavos;
  const pctRecebido = previsto > 0 ? Math.round((cartoes.recebido_mes_centavos / previsto) * 100) : 0;

  return (
    <section>
      <header className="pagina__topo">
        <div>
          <p className="sobretitulo">Olá, Lucca</p>
          <h1>Mission Control</h1>
        </div>
        <div className="mission__topo-acoes">
          <p className="vazio">{dataDeHoje()}</p>
          <div className="notif">
            <button type="button" className="btn btn--icone notif__botao" aria-expanded={aberto} aria-label={`Pede ação (${pedeAtencao.length})`}
              onClick={() => setAberto((v) => !v)} onKeyDown={(e) => e.key === 'Escape' && setAberto(false)}>
              <Icone nome="alerta" tamanho={22} />
              {pedeAtencao.length > 0 && <span className="notif__contagem">{pedeAtencao.length}</span>}
            </button>
            {aberto && (
              <div className="notif__painel" role="dialog" aria-label="Pede ação">
                <h2>Pede ação</h2>
                <PedeAtencao itens={pedeAtencao} />
              </div>
            )}
          </div>
        </div>
      </header>
      <AvisosPublicacao />
      <AvisosSites mostrar="fora_do_ar" />
      <AvisosConexoes />
      <section className="cartao financa">
        <div className="financa__bloco">
          <Link to="/financeiro" className="financa__item">
            <span className="financa__rotulo">Recebido no mês</span>
            <span className="financa__valor financa__valor--grande">{formatarDinheiro(cartoes.recebido_mes_centavos)}</span>
          </Link>
          <div className="financa__barra" role="img" aria-label={`${pctRecebido}% do previsto no mês já foi recebido`}>
            <span style={{ width: `${pctRecebido}%` }} />
          </div>
          <p className="financa__nota">{pctRecebido}% do previsto no mês</p>
        </div>
        <Link to="/financeiro?aba=recebimentos" className="financa__item">
          <span className="financa__rotulo">A receber no mês</span>
          <span className="financa__valor">{formatarDinheiro(cartoes.a_receber_mes_centavos)}</span>
        </Link>
        <Link to="/financeiro?aba=recebimentos" className={`financa__item${atrasadas.quantidade > 0 ? ' financa__item--perigo' : ''}`}>
          <span className="financa__rotulo">Vencido</span>
          <span className="financa__valor">{formatarDinheiro(atrasadas.total_centavos)}</span>
          <span className="financa__nota">{plural(atrasadas.quantidade, 'parcela', 'parcelas')}</span>
        </Link>
      </section>

      <div className="faixa">
        <Link to="/servicos?aba=sites" className="faixa__item">
          <span className="faixa__valor">{cartoes.em_andamento}</span>
          <span><b>Projetos em andamento</b><small>{detalhe.prototipo} em protótipo, {detalhe.andamento} em versão final</small></span>
        </Link>
        <Link to="/servicos?aba=sites" className="faixa__item">
          <span className="faixa__valor">{propostas.quantidade}</span>
          <span><b>Propostas abertas</b><small>{formatarDinheiro(propostas.total_centavos)}</small></span>
        </Link>
      </div>

      <div className="mission__colunas">
        <TodoInicio tarefas={tarefas} />
        <ParaEntregar paraEntregar={paraEntregar} />
      </div>

      <div className="inicio__linha">
        <FollowUps followUps={followUps} />
        <Divulgacao divulgacao={divulgacao} />
        <AgendaDoDia />
      </div>

      <Graficos />
    </section>
  );
}
