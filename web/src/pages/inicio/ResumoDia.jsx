import { Link } from 'react-router';
import { ABA_DO_SERVICO } from '../../lib/rotulos.js';

const ROTULO_CANAL = { instagram: 'Instagram', portfolio: 'Portfólio' };
const paginaDoServico = (item) => `/clientes/${item.cliente_id}?aba=${ABA_DO_SERVICO[item.servico]}`;

function ClientesDoServico({ itens, vazio }) {
  if (!itens.length) return <p className="vazio">{vazio}</p>;
  return (
    <ul className="lista">
      {itens.map((item) => <li key={item.projeto_id}><Link to={paginaDoServico(item)}>{item.cliente_nome}</Link></li>)}
    </ul>
  );
}

const MAX_POR_GRUPO = 5;
const primeiros = (itens) => itens.slice(0, MAX_POR_GRUPO);
const Resto = ({ itens }) => itens.length > MAX_POR_GRUPO && <li className="vazio">+{itens.length - MAX_POR_GRUPO} outros</li>;

export function FollowUps({ followUps }) {
  const { orcamentos, projetos, aguardando } = followUps;
  const semFollowUps = !orcamentos.length && !projetos.length && !aguardando.length;
  return (
    <section className="cartao">
      <h2>Follow-ups</h2>
      {semFollowUps ? <p className="vazio">Ninguém esperando por você.</p> : (
        <ul className="lista">
          {primeiros(orcamentos).map((o) => <li key={`o${o.id}`}><Link to={o.link}>Orçamento · {o.cliente_nome} · enviado há {o.dias} d</Link></li>)}
          <Resto itens={orcamentos} />
          {primeiros(projetos).map((p) => <li key={`p${p.id}`}><Link to={p.link}>{p.titulo} · {p.cliente_nome} · parado há {p.dias} d</Link></li>)}
          <Resto itens={projetos} />
          {primeiros(aguardando).map((a) => (
            <li key={`a${a.cliente_id}`}>
              <Link to={a.link}>{a.cliente_nome} · {a.quantidade} {a.quantidade === 1 ? 'tarefa aguardando' : 'tarefas aguardando'}</Link>
            </li>
          ))}
          <Resto itens={aguardando} />
        </ul>
      )}
    </section>
  );
}

export function ParaEntregar({ paraEntregar }) {
  const gmn = paraEntregar.itens.filter((i) => i.servico === 'google_meu_negocio');
  const placas = paraEntregar.itens.filter((i) => i.servico === 'placas_nfc');
  return (
    <section className="cartao">
      <h2>Para entregar</h2>
      <h3 className="cartao__titulo inicio__grupo">Google Meu Negócio</h3>
      <ClientesDoServico itens={gmn} vazio="Nenhum GMN pendente." />
      <h3 className="cartao__titulo inicio__grupo">Placas NFC</h3>
      <ClientesDoServico itens={placas} vazio="Nenhuma placa pendente." />
    </section>
  );
}

export function Divulgacao({ divulgacao }) {
  return (
    <section className="cartao">
      <h2>Divulgação</h2>
      <h3 className="cartao__titulo inicio__grupo">Falta divulgar</h3>
      {divulgacao.length ? (
        <ul className="lista">
          {divulgacao.map((p) => (
            <li key={p.projeto_id} className="divulgacao__linha">
              <Link to={`/projetos/${p.projeto_id}`}>{p.projeto_titulo}</Link>
              <span className="divulgacao__etiquetas">
                {p.falta.map((canal) => <span key={canal} className={`etiqueta etiqueta--${canal}`}>{ROTULO_CANAL[canal]}</span>)}
              </span>
              {p.ficticio && <span className="etiqueta">fictício</span>}
            </li>
          ))}
        </ul>
      ) : <p className="vazio">Tudo divulgado.</p>}
    </section>
  );
}

export function AgendaDoDia() {
  return (
    <section className="cartao">
      <h2>Agenda</h2>
      <p className="vazio">Agenda do dia — em breve (Google Agenda)</p>
    </section>
  );
}

// Os quatro cartões empilhados numa coluna; cada um também pode ser usado sozinho.
export function ResumoDia({ followUps, paraEntregar, divulgacao }) {
  return (
    <div className="inicio__coluna">
      <FollowUps followUps={followUps} />
      <ParaEntregar paraEntregar={paraEntregar} />
      <Divulgacao divulgacao={divulgacao} />
      <AgendaDoDia />
    </div>
  );
}
