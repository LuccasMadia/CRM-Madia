import { lazy, Suspense } from 'react';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { Aviso } from '../components/Aviso.jsx';
import { Carregando } from '../components/Carregando.jsx';
import { AvisosPublicacao } from '../components/AvisosPublicacao.jsx';
import { AvisosSites } from '../components/AvisosSites.jsx';
import { Numero } from '../components/Numero.jsx';
import { CartaoGrafico } from '../components/graficos/CartaoGrafico.jsx';
import { Funil } from '../components/graficos/Funil.jsx';
import { formatarDinheiro } from '../lib/dinheiro.js';
import { TodoInicio } from './inicio/TodoInicio.jsx';
import { ResumoDia } from './inicio/ResumoDia.jsx';

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
  const { dados, erro, recarregar } = useCarregar(() => api('/painel'), []);
  if (erro) return <Aviso erro={erro} />;
  if (!dados) return <Carregando />;
  const { cartoes, tarefas_abertas: tarefas, pede_atencao: pedeAtencao, follow_ups: followUps, divulgacao = [], para_entregar: paraEntregar = { gmn: 0, placas: 0, itens: [] } } = dados;
  const { atrasadas, em_andamento_detalhe: detalhe, propostas } = cartoes;

  return (
    <section>
      <header className="pagina__topo">
        <div>
          <p className="sobretitulo">Olá, Lucca</p>
          <h1>Mission Control</h1>
        </div>
        <p className="vazio">{dataDeHoje()}</p>
      </header>
      <AvisosPublicacao />
      <AvisosSites mostrar="fora_do_ar" />
      <div className="cartoes mission__numeros">
        <Numero rotulo="Recebido no mês" para="/financeiro">{formatarDinheiro(cartoes.recebido_mes_centavos)}</Numero>
        <Numero rotulo="A receber no mês" para="/financeiro?aba=recebimentos">{formatarDinheiro(cartoes.a_receber_mes_centavos)}</Numero>
        <Numero rotulo="Vencido" para="/financeiro?aba=recebimentos" tom={atrasadas.quantidade > 0 ? 'perigo' : undefined}
          detalhe={plural(atrasadas.quantidade, 'parcela', 'parcelas')}>{formatarDinheiro(atrasadas.total_centavos)}</Numero>
        <Numero rotulo="Projetos em andamento" para="/servicos?aba=sites"
          detalhe={`${detalhe.prototipo} em protótipo, ${detalhe.andamento} em versão final`}>{cartoes.em_andamento}</Numero>
        <Numero rotulo="Propostas abertas" para="/servicos?aba=sites" detalhe={formatarDinheiro(propostas.total_centavos)}>{propostas.quantidade}</Numero>
      </div>

      <div className="mission__colunas">
        <TodoInicio tarefas={tarefas} aoMudar={recarregar} />
        <ResumoDia pedeAtencao={pedeAtencao} followUps={followUps} paraEntregar={paraEntregar} divulgacao={divulgacao} />
      </div>

      <Graficos />
    </section>
  );
}
