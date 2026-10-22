import { lazy, Suspense } from 'react';
import { Link } from 'react-router';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { Aviso } from '../components/Aviso.jsx';
import { Carregando } from '../components/Carregando.jsx';
import { AvisosPublicacao } from '../components/AvisosPublicacao.jsx';
import { AvisosSites } from '../components/AvisosSites.jsx';
import { Numero } from '../components/Numero.jsx';
import { CartaoGrafico } from '../components/graficos/CartaoGrafico.jsx';
import { Funil } from '../components/graficos/Funil.jsx';
import { formatarData, hojeISO } from '../lib/datas.js';
import { ABA_DO_SERVICO, ROTULO_ETAPA_TAREFA } from '../lib/rotulos.js';

// Recharts só é baixado quando a Início abre.
const GraficoRosca = lazy(() => import('../components/graficos/GraficoRosca.jsx').then((m) => ({ default: m.GraficoRosca })));

const dataDeHoje = () => new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

const ROTULO_CANAL = { instagram: 'Instagram', portfolio: 'Portfólio' };
const paginaDoServico = (item) => `/clientes/${item.cliente_id}?aba=${ABA_DO_SERVICO[item.servico]}`;
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
// "A fazer" não ganha etiqueta: só destaca o que já está andando ou parado no cliente.
const ETIQUETA_ETAPA = { fazendo: 'etiqueta--andamento', aguardando_cliente: 'etiqueta--proposta' };

function TarefasPorProjeto({ projetos, vazio }) {
  const hoje = hojeISO();
  if (!projetos.length) return <p className="vazio">{vazio}</p>;
  return (
    <ul className="lista">
      {projetos.map((p) => (
        <li key={p.projeto_id} style={{ display: 'block' }}>
          <Link to={`/projetos/${p.projeto_id}`}>{p.projeto_titulo}</Link>
          <ul className="lista tarefas-inicio">
            {p.tarefas.map((t) => (
              <li key={t.id}>
                <span>{t.texto}</span>
                {ETIQUETA_ETAPA[t.etapa] && (
                  <span className={`etiqueta ${ETIQUETA_ETAPA[t.etapa]}`}>{ROTULO_ETAPA_TAREFA[t.etapa]}</span>
                )}
                {t.prazo && (
                  <span className={t.prazo < hoje ? 'item-atrasado' : 'vazio'}>
                    {formatarData(t.prazo)}{t.prazo < hoje && ' · atrasada'}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function Entregas({ projetos, paraEntregar }) {
  const gmn = paraEntregar.itens.filter((i) => i.servico === 'google_meu_negocio');
  const placas = paraEntregar.itens.filter((i) => i.servico === 'placas_nfc');
  return (
    <section className="cartao">
      <h2>Entregas a clientes</h2>
      <h3 className="cartao__titulo inicio__grupo">Sites e sistemas</h3>
      <TarefasPorProjeto projetos={projetos} vazio="Nenhuma tarefa pendente." />
      <h3 className="cartao__titulo inicio__grupo">Google Meu Negócio</h3>
      <ClientesDoServico itens={gmn} vazio="Nenhum GMN pendente." />
      <h3 className="cartao__titulo inicio__grupo">Placas NFC</h3>
      <ClientesDoServico itens={placas} vazio="Nenhuma placa pendente." />
    </section>
  );
}

function ClientesDoServico({ itens, vazio }) {
  if (!itens.length) return vazio && <p className="vazio">{vazio}</p>;
  return (
    <ul className="lista">
      {itens.map((item) => (
        <li key={item.projeto_id}><Link to={paginaDoServico(item)}>{item.cliente_nome}</Link></li>
      ))}
    </ul>
  );
}

function Divulgacao({ pendentes, ficticios }) {
  return (
    <section className="cartao">
      <h2>Divulgação e portfólio</h2>
      <h3 className="cartao__titulo inicio__grupo">Falta divulgar</h3>
      {pendentes.length ? (
        <ul className="lista">
          {pendentes.map((p) => (
            <li key={p.projeto_id} className="divulgacao__linha">
              <Link to={`/projetos/${p.projeto_id}`}>{p.projeto_titulo}</Link>
              <span className="divulgacao__etiquetas">
                {p.falta.map((canal) => <span key={canal} className="etiqueta etiqueta--andamento">{ROTULO_CANAL[canal]}</span>)}
                {p.ficticio && <span className="etiqueta">fictício</span>}
              </span>
            </li>
          ))}
        </ul>
      ) : <p className="vazio">Tudo divulgado.</p>}
      <h3 className="cartao__titulo inicio__grupo">Fictícios em construção</h3>
      <TarefasPorProjeto projetos={ficticios} vazio="Nenhuma tarefa pendente." />
    </section>
  );
}

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
  const { dados, erro } = useCarregar(() => api('/painel'), []);
  if (erro) return <Aviso erro={erro} />;
  if (!dados) return <Carregando />;
  const { cartoes, tarefas_por_projeto: tarefasPorProjeto, divulgacao = [], para_entregar: paraEntregar = { gmn: 0, placas: 0, itens: [] } } = dados;

  return (
    <section>
      <header className="pagina__topo">
        <div>
          <p className="sobretitulo">Olá, Lucca</p>
          <h1>Início</h1>
        </div>
        <p className="vazio">{dataDeHoje()}</p>
      </header>
      <AvisosPublicacao />
      <AvisosSites mostrar="fora_do_ar" />
      {/* dinheiro mora no Financeiro: aqui só o lembrete, sem valores */}
      {cartoes.atrasadas.quantidade > 0 && (
        <p className="aviso aviso--erro inicio__lembrete">
          {plural(cartoes.atrasadas.quantidade, 'cobrança atrasada', 'cobranças atrasadas')}.{' '}
          <Link to="/financeiro?aba=recebimentos">Ver no Financeiro</Link>
        </p>
      )}
      <div className="cartoes">
        <Numero rotulo="Projetos em andamento" icone="projetos">{cartoes.em_andamento}</Numero>
        <Numero rotulo="Propostas abertas" icone="funil">{cartoes.propostas.quantidade}</Numero>
      </div>

      <Graficos />

      <div className="grade-2 inicio__trabalho">
        <Entregas projetos={tarefasPorProjeto.reais} paraEntregar={paraEntregar} />
        <Divulgacao pendentes={divulgacao} ficticios={tarefasPorProjeto.ficticios} />
      </div>
    </section>
  );
}
