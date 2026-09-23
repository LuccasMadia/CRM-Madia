import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Aviso } from '../components/Aviso.jsx';
import { FormCliente } from '../components/FormCliente.jsx';
import { formatarDinheiro } from '../lib/dinheiro.js';
import { ROTULO_ETAPA } from '../lib/rotulos.js';

export function ClienteDetalhe() {
  const { id } = useParams();
  const navegar = useNavigate();
  const { dados: cliente, erro, recarregar } = useCarregar(() => api(`/clientes/${id}`), [id]);
  const exclusao = useEnvio();

  if (erro) return <Aviso erro={erro} />;
  if (!cliente) return <p>Carregando…</p>;

  async function salvar(dados) {
    await api(`/clientes/${id}`, { method: 'PUT', body: dados });
    recarregar();
  }

  function excluir() {
    if (!window.confirm(`Excluir o cliente ${cliente.nome}?`)) return;
    exclusao.executar(async () => {
      await api(`/clientes/${id}`, { method: 'DELETE' });
      navegar('/clientes');
    });
  }

  return (
    <section>
      <header className="pagina__topo">
        <div>
          <p className="sobretitulo"><Link to="/clientes">Clientes</Link></p>
          <h1>{cliente.nome}</h1>
        </div>
        <button type="button" className="btn btn--perigo" onClick={excluir}>Excluir</button>
      </header>
      <Aviso erro={exclusao.erro} />
      <div className="grade-2">
        <div className="cartao">
          <h2>Dados</h2>
          <FormCliente key={cliente.atualizado_em} inicial={cliente} onSalvar={salvar} />
        </div>
        <div className="cartao">
          <h2>Projetos</h2>
          <p>Total faturado: <strong>{formatarDinheiro(cliente.total_faturado_centavos)}</strong></p>
          {cliente.projetos.length ? (
            <ul className="lista">
              {cliente.projetos.map((p) => (
                <li key={p.id}>
                  <Link to={`/projetos/${p.id}`}>{p.titulo}</Link>
                  <span className={`etiqueta etiqueta--${p.etapa}`}>{ROTULO_ETAPA[p.etapa]}</span>
                </li>
              ))}
            </ul>
          ) : <p className="vazio">Nenhum projeto ainda. Crie uma oportunidade no Funil.</p>}
        </div>
      </div>
    </section>
  );
}
