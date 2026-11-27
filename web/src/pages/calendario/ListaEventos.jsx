import { Link } from 'react-router';
import { formatarData } from '../../lib/datas.js';
import { eventosDoDia, rotuloHora, somarDias } from './datasCalendario.js';
import { ChipPrazo } from './Itens.jsx';

const SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const nomeDoDia = (dia) => `${SEMANA[new Date(`${dia}T00:00:00Z`).getUTCDay()]}, ${formatarData(dia)}`;

// Só os dias que têm algo, em ordem; é a visão padrão no celular.
export function ListaEventos({ de, ate, hoje, eventos, prazos, cores = {}, clientes = [], onAbrir }) {
  const dias = [];
  for (let dia = de; dia <= ate; dia = somarDias(dia, 1)) {
    const doDia = eventosDoDia(eventos, dia);
    const prazosDoDia = prazos.filter((p) => p.dia === dia);
    if (doDia.length || prazosDoDia.length) dias.push({ dia, doDia, prazosDoDia });
  }
  if (!dias.length) return <p className="vazio">Nada neste período.</p>;

  const nomeCliente = (id) => clientes.find((c) => c.id === id)?.nome;
  return (
    <div className="agenda__lista">
      {dias.map(({ dia, doDia, prazosDoDia }) => (
        <section key={dia} className={dia === hoje ? 'agenda__dia agenda__dia--hoje' : 'agenda__dia'}>
          <h3>{nomeDoDia(dia)}</h3>
          <ul>
            {doDia.map((e) => (
              <li key={e.id}>
                <button type="button" className="agenda__linha" onClick={() => onAbrir(e)}>
                  {cores[e.calendario_href] && <span className="agenda__ponto" style={{ background: cores[e.calendario_href] }} aria-hidden="true" />}
                  <span className="agenda__hora">{rotuloHora(e, dia)}</span>
                  <strong>{e.titulo}</strong>
                  {e.local && <span className="vazio">{e.local}</span>}
                  {e.cliente_id && nomeCliente(e.cliente_id) && <span className="vazio">{nomeCliente(e.cliente_id)}</span>}
                  {e.pendente ? <span className="selo">Pendente</span> : null}
                  {e.recorrente ? <span className="selo">Recorrente</span> : null}
                </button>
                {e.projeto_id && <Link to={`/projetos/${e.projeto_id}`} className="agenda__ligacao">Abrir projeto</Link>}
              </li>
            ))}
            {prazosDoDia.map((p) => <li key={p.chave}><ChipPrazo prazo={p} /></li>)}
          </ul>
        </section>
      ))}
    </div>
  );
}
