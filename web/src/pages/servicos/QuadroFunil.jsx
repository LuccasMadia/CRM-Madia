import { Link } from 'react-router';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { Aviso } from '../../components/Aviso.jsx';
import { Kanban } from '../../components/Kanban.jsx';
import { formatarDinheiro } from '../../lib/dinheiro.js';
import { formatarData, diasDesde } from '../../lib/datas.js';
import { ETAPAS, ETAPAS_FICTICIO, ROTULO_ETAPA } from '../../lib/rotulos.js';

const DIAS_DE_TESTE = 7;
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const somarDias = (iso, dias) => new Date(Date.parse(`${iso}T00:00:00Z`) + dias * 86400000).toISOString().slice(0, 10);

function SituacaoTeste({ inicio }) {
  const faltam = DIAS_DE_TESTE - diasDesde(inicio);
  if (faltam < 0) return <span className="etiqueta etiqueta--atrasada">{`Teste acabou em ${formatarData(somarDias(inicio, DIAS_DE_TESTE))}`}</span>;
  if (faltam === 0) return <span className="etiqueta etiqueta--proposta">Teste termina hoje</span>;
  return <span className="etiqueta etiqueta--andamento">{`Faltam ${plural(faltam, 'dia', 'dias')}`}</span>;
}

function SeloPagamento({ total, pagas }) {
  if (!total) return <span className="etiqueta">Sem parcelas lançadas</span>;
  if (pagas >= total) return <span className="etiqueta etiqueta--entregue">Pago</span>;
  if (pagas > 0) return <span className="etiqueta etiqueta--proposta">Pago em parte</span>;
  return <span className="etiqueta etiqueta--atrasada">Aguardando pagamento</span>;
}

// O que cada etapa precisa mostrar além do título: protótipo pronto, prazo do teste e pagamento.
function ExtrasDoCard({ projeto: p, ficticio, onMudar }) {
  if (p.etapa === 'prototipo') {
    const pronto = Boolean(p.prototipo_pronto);
    return (
      <p className="kanban__extra">
        <button type="button" className="selo-prototipo" aria-pressed={pronto} onClick={() => onMudar(p, { prototipo_pronto: !pronto })}>
          {pronto ? 'Protótipo pronto' : 'Protótipo em construção'}
        </button>
      </p>
    );
  }
  if (p.etapa === 'teste') {
    return (
      <div className="kanban__extra">
        <input
          type="date"
          aria-label={`Início do teste de ${p.titulo}`}
          title="Início do teste"
          value={p.teste_inicio ?? ''}
          onChange={(e) => onMudar(p, { teste_inicio: e.target.value || null })}
        />
        {p.teste_inicio ? <SituacaoTeste inicio={p.teste_inicio} /> : <span>defina quando o teste começou</span>}
      </div>
    );
  }
  if (p.etapa === 'andamento' && !ficticio) {
    return <p className="kanban__extra"><SeloPagamento total={p.parcelas_total} pagas={p.parcelas_pagas} /></p>;
  }
  if (p.etapa === 'entregue' && p.data_entrega) {
    return <p className="kanban__extra">{`Entregue em ${formatarData(p.data_entrega)}`}</p>;
  }
  return null;
}

// Visão em quadro dos sites e sistemas: cada coluna é uma etapa, e o card muda de etapa pelo menu.
export function QuadroFunil({ ficticio }) {
  const { dados: projetos, erro, recarregar } = useCarregar(
    () => api(`/projetos?servico=site_sistema&ficticio=${ficticio ? 1 : 0}`),
    [ficticio],
  );
  const mudanca = useEnvio();
  const colunas = (ficticio ? ETAPAS_FICTICIO : ETAPAS).map((id) => ({ id, titulo: ROTULO_ETAPA[id] }));

  function mudar(projeto, corpo) {
    mudanca.executar(async () => {
      await api(`/projetos/${projeto.id}`, { method: 'PUT', body: corpo });
      recarregar();
    });
  }

  return (
    <>
      <Aviso erro={erro ?? mudanca.erro} />
      {projetos && (
        <Kanban
          colunas={colunas}
          itens={projetos}
          colunaDe={(p) => p.etapa}
          tituloDe={(p) => p.titulo}
          recolhidas={ficticio ? [] : ['perdido']}
          onMover={(projeto, etapa) => mudar(projeto, { etapa })}
          renderItem={(p) => (
            <>
              <Link to={`/projetos/${p.id}`} className="kanban__titulo">{p.titulo}</Link>
              <p className="kanban__meta"><Link to={`/clientes/${p.cliente_id}`}>{p.cliente_nome}</Link></p>
              <p className="kanban__meta">{formatarDinheiro(p.valor_total_centavos)} · prazo {formatarData(p.prazo_entrega)}</p>
              <ExtrasDoCard projeto={p} ficticio={ficticio} onMudar={mudar} />
            </>
          )}
        />
      )}
    </>
  );
}
