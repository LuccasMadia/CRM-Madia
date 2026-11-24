import { Link } from 'react-router';
import { api } from '../../api/client.js';
import { useState } from 'react';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { Aviso } from '../../components/Aviso.jsx';
import { Kanban } from '../../components/Kanban.jsx';
import { Modal } from '../../components/Modal.jsx';
import { EtiquetasCategorias, temCategoria } from '../../components/CategoriaSite.jsx';
import { formatarDinheiro } from '../../lib/dinheiro.js';
import { formatarData, diasDesde } from '../../lib/datas.js';
import { DIAS_PARADO, ETAPAS, ETAPAS_FICTICIO, ETAPAS_SEM_PARADO, ROTULO_ETAPA, ROTULO_MOTIVO_PERDA, VEZ_DA_ETAPA } from '../../lib/rotulos.js';
import { notificar } from '../../lib/notificacoes.js';
import { DIAS_DE_TESTE } from './atencaoSites.js';
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

// De quem é a vez e há quanto tempo o projeto está na etapa; a partir de DIAS_PARADO fica destacado.
function VezDaEtapa({ projeto: p }) {
  const vez = VEZ_DA_ETAPA[p.etapa];
  if (!vez || !p.etapa_desde) return null;
  const dias = Math.max(0, diasDesde(p.etapa_desde));
  const parado = dias >= DIAS_PARADO && !ETAPAS_SEM_PARADO.includes(p.etapa);
  return (
    <p className="kanban__extra">
      <span className={`etiqueta ${vez === 'voce' ? 'etiqueta--voce' : 'etiqueta--aguardando'}`}>{vez === 'voce' ? 'Sua vez' : 'Com o cliente'}</span>
      <span className={parado ? 'kanban__parado' : undefined}>{dias === 0 ? 'hoje' : `há ${plural(dias, 'dia', 'dias')}`}</span>
    </p>
  );
}

// Ao marcar como perdido, pergunta o motivo (pode ficar em branco) para dar para aprender com as vendas que não fecharam.
function MotivoDaPerda({ projeto, onConfirmar, onFechar }) {
  const [motivo, setMotivo] = useState('');
  return (
    <Modal titulo={`Por que ${projeto.titulo} foi perdido?`} onFechar={onFechar}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); onConfirmar(motivo || null); }}>
        <div className="campo">
          <label htmlFor="motivo-perda">Motivo</label>
          <select id="motivo-perda" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
            <option value="">Sem motivo definido</option>
            {Object.entries(ROTULO_MOTIVO_PERDA).map(([chave, rotulo]) => <option key={chave} value={chave}>{rotulo}</option>)}
          </select>
        </div>
        <button type="submit" className="btn btn--primario">Marcar como perdido</button>
      </form>
    </Modal>
  );
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
        {!ficticio && (
          <button type="button" className="btn btn--pequeno kanban__entregar" onClick={() => onMudar(p, { etapa: 'entregue' })}>Marcar como entregue</button>
        )}
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

const etapas = (ids) => ids.map((id) => ({ id, titulo: ROTULO_ETAPA[id] }));
const ENCERRADAS = ['entregue', 'perdido'];

// Colunas de cada modo. Entregue vai para a visão "No ar" e perdido é filtro à parte, então no quadro
// dos reais elas não viram coluna, mas continuam no menu "Mover" (destinos).
const MODOS = {
  reais: { colunas: etapas(ETAPAS.filter((e) => !ENCERRADAS.includes(e))), destinos: etapas(ENCERRADAS) },
  ficticios: { colunas: etapas(ETAPAS_FICTICIO), destinos: [] },
  privados: { colunas: etapas(ETAPAS_FICTICIO), destinos: [] },
  perdidos: { colunas: etapas(['perdido']), destinos: etapas(ETAPAS.filter((e) => e !== 'perdido')) },
};

// Visão em quadro dos sites e sistemas: cada coluna é uma etapa, e o card muda de etapa pelo menu.
// modo: 'reais' (o trabalho em andamento), 'ficticios' (cases do portfólio), 'privados' (uso interno) ou 'perdidos'.
const FILTRO_DO_MODO = { reais: 'ficticio=0', ficticios: 'ficticio=1&privado=0', privados: 'privado=1', perdidos: 'ficticio=0' };
export function QuadroFunil({ modo = 'reais', categoriaId = '', layout = 'colunas', onMudou }) {
  const ficticio = modo === 'ficticios' || modo === 'privados';
  const { dados: projetos, erro, recarregar } = useCarregar(
    () => api(`/projetos?servico=site_sistema&${FILTRO_DO_MODO[modo] ?? FILTRO_DO_MODO.reais}`),
    [modo],
  );
  const mudanca = useEnvio();
  const [perdendo, setPerdendo] = useState(null);
  const { colunas, destinos } = MODOS[modo] ?? MODOS.reais;

  function mudar(projeto, corpo) {
    mudanca.executar(async () => {
      await api(`/projetos/${projeto.id}`, { method: 'PUT', body: corpo });
      recarregar();
      onMudou?.();
      // o card some do quadro: diz para onde ele foi
      if (modo === 'reais' && corpo.etapa === 'entregue') notificar(`${projeto.titulo} foi para No ar`);
      if (modo === 'reais' && corpo.etapa === 'perdido') notificar(`${projeto.titulo} foi para Perdidos`);
    });
  }

  return (
    <div className="quadro-sites">
      <Aviso erro={erro ?? mudanca.erro} />
      {projetos && (
        <Kanban
          colunas={colunas}
          layout={layout}
          itens={projetos.filter((p) => temCategoria(p, categoriaId))}
          colunaDe={(p) => p.etapa}
          tituloDe={(p) => p.titulo}
          destinosExtras={destinos}
          onMover={(projeto, etapa) => (etapa === 'perdido' ? setPerdendo(projeto) : mudar(projeto, { etapa }))}
          renderItem={(p) => (
            <>
              <Link to={`/projetos/${p.id}`} className="kanban__titulo">{p.titulo}</Link>
              <EtiquetasCategorias categorias={p.categorias} />
              <p className="kanban__meta"><Link to={`/clientes/${p.cliente_id}`}>{p.cliente_nome}</Link></p>
              <p className="kanban__meta">{formatarDinheiro(p.valor_total_centavos)} · prazo {formatarData(p.prazo_entrega)}</p>
              {!ficticio && <VezDaEtapa projeto={p} />}
              {p.etapa === 'perdido' && p.motivo_perda && <p className="kanban__meta">{`Motivo: ${ROTULO_MOTIVO_PERDA[p.motivo_perda] ?? p.motivo_perda}`}</p>}
              <ExtrasDoCard projeto={p} ficticio={ficticio} onMudar={mudar} />
            </>
          )}
        />
      )}
      {perdendo && (
        <MotivoDaPerda
          projeto={perdendo}
          onFechar={() => setPerdendo(null)}
          onConfirmar={(motivo) => { mudar(perdendo, { etapa: 'perdido', motivo_perda: motivo }); setPerdendo(null); }}
        />
      )}
    </div>
  );
}
