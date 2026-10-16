import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../../api/client.js';
import { Modal } from '../../components/Modal.jsx';
import { FormOportunidade } from '../../components/FormOportunidade.jsx';
import { formatarDinheiro } from '../../lib/dinheiro.js';
import { ROTULO_ETAPA } from '../../lib/rotulos.js';

export function AbaSites({ cliente, projetos }) {
  const [criando, setCriando] = useState(false);
  const navegar = useNavigate();

  async function criar(dados) {
    const projeto = await api('/projetos', { method: 'POST', body: dados });
    navegar(`/projetos/${projeto.id}`);
  }

  return (
    <div className="cartao">
      <div className="pagina__topo">
        <h2>Sites e Sistemas</h2>
        <button type="button" className="btn btn--primario" onClick={() => setCriando(true)}>+ Nova oportunidade</button>
      </div>
      {projetos.length ? (
        <ul className="lista">
          {projetos.map((p) => (
            <li key={p.id}>
              <Link to={`/projetos/${p.id}`}>{p.titulo}</Link>
              <span className={`etiqueta etiqueta--${p.etapa}`}>{ROTULO_ETAPA[p.etapa]}</span>
              <span>{formatarDinheiro(p.valor_total_centavos)}</span>
            </li>
          ))}
        </ul>
      ) : <p className="vazio">Nenhum site ou sistema ainda.</p>}
      {criando && (
        <Modal titulo="Nova oportunidade" onFechar={() => setCriando(false)}>
          <FormOportunidade onSalvar={criar} clienteInicial={cliente.id} />
        </Modal>
      )}
    </div>
  );
}
