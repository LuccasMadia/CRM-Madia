import { Link, useNavigate } from 'react-router';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { Aviso } from '../../components/Aviso.jsx';
import { formatarDinheiro } from '../../lib/dinheiro.js';
import { formatarData } from '../../lib/datas.js';

export const ROTULO_SITUACAO = { rascunho: 'Rascunho', enviado: 'Enviado', aceito: 'Aceito', recusado: 'Recusado' };

export const numeroOrcamento = (n) => String(n).padStart(3, '0');

function resumoValor(totais) {
  const unico = formatarDinheiro(totais.total_unico_centavos);
  return totais.total_mensal_centavos > 0 ? `${unico} + ${formatarDinheiro(totais.total_mensal_centavos)}/mês` : unico;
}

export function AbaOrcamentos({ cliente }) {
  const navegar = useNavigate();
  const { dados: orcamentos, erro } = useCarregar(() => api(`/clientes/${cliente.id}/orcamentos`), [cliente.id]);
  const criacao = useEnvio();

  function novo() {
    criacao.executar(async () => {
      const criado = await api(`/clientes/${cliente.id}/orcamentos`, { method: 'POST' });
      navegar(`/orcamentos/${criado.id}`);
    });
  }

  return (
    <section className="cartao">
      <div className="cartao-grafico__topo">
        <h2>Orçamentos</h2>
        <button type="button" className="btn btn--primario" onClick={novo} disabled={criacao.enviando}>Novo orçamento</button>
      </div>
      <Aviso erro={erro ?? criacao.erro} />
      {orcamentos && orcamentos.length === 0 && <p className="vazio">Nenhum orçamento ainda.</p>}
      {orcamentos && orcamentos.length > 0 && (
        <ul className="lista-montadas">
          {orcamentos.map((o) => (
            <li key={o.id}>
              <Link to={`/orcamentos/${o.id}`}>
                {`nº ${numeroOrcamento(o.numero)} · ${formatarData(o.data)} · ${ROTULO_SITUACAO[o.situacao] ?? o.situacao} · ${resumoValor(o.totais)}`}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
