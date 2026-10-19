import { lazy, Suspense } from 'react';
import { Link } from 'react-router';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { Aviso } from '../components/Aviso.jsx';
import { AvisosPublicacao } from '../components/AvisosPublicacao.jsx';
import { Numero } from '../components/Numero.jsx';
import { CartaoGrafico } from '../components/graficos/CartaoGrafico.jsx';
import { Funil } from '../components/graficos/Funil.jsx';
import { formatarDinheiro } from '../lib/dinheiro.js';
import { formatarData, hojeISO } from '../lib/datas.js';
import { ABA_DO_SERVICO, ROTULO_SERVICO } from '../lib/rotulos.js';

// Recharts só é baixado quando a Início abre.
const GraficoLinha = lazy(() => import('../components/graficos/GraficoLinha.jsx').then((m) => ({ default: m.GraficoLinha })));
const GraficoRosca = lazy(() => import('../components/graficos/GraficoRosca.jsx').then((m) => ({ default: m.GraficoRosca })));
const GraficoBarras = lazy(() => import('../components/graficos/GraficoBarras.jsx').then((m) => ({ default: m.GraficoBarras })));

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const rotuloMes = (anoMes) => MESES[Number(anoMes.slice(5, 7)) - 1];
const dataDeHoje = () => new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

const ROTULO_CANAL = { instagram: 'Instagram', portfolio: 'Portfólio' };
const paginaDoServico = (item) => `/clientes/${item.cliente_id}?aba=${ABA_DO_SERVICO[item.servico]}`;
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

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
      <ClientesDoServico itens={placas} vazio={paraEntregar.placas ? null : 'Nenhuma placa pendente.'} />
      {paraEntregar.placas > 0 && (
        <p><Link to="/servicos?aba=placas&placas=vendas">{plural(paraEntregar.placas, 'venda de placas a receber', 'vendas de placas a receber')}</Link></p>
      )}
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
  if (!dados) return <p className="vazio">Carregando gráficos…</p>;
  const { funil, recebido_por_mes: recebido, origens, por_servico: porServico } = dados;
  const carregando = <p className="vazio">Carregando…</p>;

  return (
    <>
      <div className="grade-graficos">
        <CartaoGrafico titulo="Funil de oportunidades" subtitulo="sites e sistemas" vazio={funil.etapas[0].quantidade === 0}>
          <Funil etapas={funil.etapas} perdidos={funil.perdidos} />
        </CartaoGrafico>
        <CartaoGrafico titulo="Faturamento por serviço" subtitulo="últimos 12 meses" vazio={porServico.every((s) => s.total_centavos === 0)}>
          <Suspense fallback={carregando}>
            <GraficoBarras dados={porServico.map((s) => ({ rotulo: ROTULO_SERVICO[s.servico], valor_centavos: s.total_centavos }))} />
          </Suspense>
        </CartaoGrafico>
      </div>
      <div className="grade-graficos">
        <CartaoGrafico titulo="De onde vêm os clientes" vazio={origens.total === 0}>
          <Suspense fallback={carregando}>
            <GraficoRosca fatias={origens.fatias} total={origens.total} />
          </Suspense>
        </CartaoGrafico>
        <CartaoGrafico titulo="Recebido por mês" subtitulo="últimos 6 meses" vazio={recebido.every((m) => m.total_centavos === 0)}>
          <Suspense fallback={carregando}>
            <GraficoLinha dados={recebido.map((m) => ({ rotulo: rotuloMes(m.mes), valor_centavos: m.total_centavos }))} />
          </Suspense>
        </CartaoGrafico>
      </div>
    </>
  );
}

export function Inicio() {
  const { dados, erro } = useCarregar(() => api('/painel'), []);
  if (erro) return <Aviso erro={erro} />;
  if (!dados) return <p>Carregando…</p>;
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
      <div className="cartoes">
        <Numero rotulo="A receber este mês" icone="financeiro">{formatarDinheiro(cartoes.a_receber_mes_centavos)}</Numero>
        <Numero rotulo="Parcelas atrasadas" icone="alerta">
          {cartoes.atrasadas.quantidade} · {formatarDinheiro(cartoes.atrasadas.total_centavos)}
        </Numero>
        <Numero rotulo="Projetos em andamento" icone="projetos">{cartoes.em_andamento}</Numero>
        <Numero rotulo="Propostas abertas" icone="funil">
          {cartoes.propostas.quantidade} · {formatarDinheiro(cartoes.propostas.total_centavos)}
        </Numero>
      </div>

      <Graficos />

      <div className="grade-2 inicio__trabalho">
        <Entregas projetos={tarefasPorProjeto.reais} paraEntregar={paraEntregar} />
        <Divulgacao pendentes={divulgacao} ficticios={tarefasPorProjeto.ficticios} />
      </div>
    </section>
  );
}
