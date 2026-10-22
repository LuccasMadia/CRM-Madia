import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { Aviso } from '../../components/Aviso.jsx';
import { AvisosSites } from '../../components/AvisosSites.jsx';
import { Modal } from '../../components/Modal.jsx';
import { Numero } from '../../components/Numero.jsx';
import { formatarDinheiro, centavosParaTexto, paraCentavos } from '../../lib/dinheiro.js';
import { formatarData, hojeISO } from '../../lib/datas.js';
import { ROTULO_STATUS } from '../../lib/hospedagem.js';
import { ABA_DO_SERVICO } from '../../lib/rotulos.js';
import { notificar } from '../../lib/notificacoes.js';
import { CobrancaMensal, comDiaSugerido, frasePrimeiraMensalidade } from '../projeto/CobrancaMensal.jsx';

// Placas só aparece se algum dia alguma venda de placas tiver mensalidade.
const GRUPOS = [
  { tipo: 'site', nome: 'Sites', vazio: 'site' },
  { tipo: 'sistema', nome: 'Sistemas', vazio: 'sistema' },
  { tipo: 'saas', nome: 'SaaS', vazio: 'SaaS' },
  { tipo: 'gmn', nome: 'Google Meu Negócio', vazio: 'Google Meu Negócio' },
  { tipo: 'placas', nome: 'Placas NFC', vazio: null },
];
const COM_HOSPEDAGEM = ['site', 'sistema', 'saas'];

const clientes = (n) => `${n} ${n === 1 ? 'cliente' : 'clientes'}`;
const paginaDo = (m) => (m.servico === 'site_sistema' ? `/projetos/${m.projeto_id}` : `/clientes/${m.cliente_id}?aba=${ABA_DO_SERVICO[m.servico]}`);

export function Mensalidades() {
  const { dados, erro, recarregar } = useCarregar(() => api('/financeiro/mensalidades'), []);
  const [editando, setEditando] = useState(null);
  const pagar = useEnvio();

  function marcarPaga(m) {
    pagar.executar(async () => {
      await api(`/parcelas/${m.em_aberto.id}`, { method: 'PUT', body: { pago_em: hojeISO() } });
      notificar(`Mensalidade de ${formatarData(m.em_aberto.vencimento)} marcada como paga`);
      recarregar();
    });
  }

  const itens = dados?.itens ?? [];
  const semNinguem = GRUPOS.filter((g) => g.vazio && !itens.some((m) => m.tipo === g.tipo)).map((g) => g.vazio);

  return (
    <section>
      <AvisosSites mostrar="cobrancas" />
      <Aviso erro={erro ?? pagar.erro} />
      {dados && <Resumo resumo={dados.resumo} />}

      {dados && !itens.length && (
        <section className="cartao"><p className="vazio">Nenhum cliente paga mensalidade ainda. Ligue a mensalidade no cadastro do projeto.</p></section>
      )}
      {GRUPOS.map((g) => {
        const doGrupo = itens.filter((m) => m.tipo === g.tipo);
        if (!doGrupo.length) return null;
        return (
          <Grupo key={g.tipo} grupo={g} itens={doGrupo} enviando={pagar.enviando}
            onPagar={marcarPaga} onEditar={setEditando} />
        );
      })}
      {dados && itens.length > 0 && semNinguem.length > 0 && (
        <p className="vazio">Ninguém paga mensalidade de {semNinguem.join(', ')} ainda.</p>
      )}

      {editando && (
        <EditarMensalidade
          item={editando}
          onFechar={() => setEditando(null)}
          onSalvo={() => { setEditando(null); recarregar(); notificar('Mensalidade salva'); }}
        />
      )}
    </section>
  );
}

function Resumo({ resumo }) {
  return (
    <div className="cartoes cartoes--resumo">
      <Numero rotulo="Entra por mês" tom={resumo.cobrando ? 'ok' : undefined} detalhe={`${clientes(resumo.cobrando)} pagando`}>
        {formatarDinheiro(resumo.por_mes_centavos)}
      </Numero>
      <Numero rotulo="Vai começar" detalhe={resumo.a_comecar ? `${clientes(resumo.a_comecar)} esperando o início` : 'ninguém esperando'}>
        {formatarDinheiro(resumo.a_comecar_centavos)}
      </Numero>
      <Numero rotulo="Atrasado" tom={resumo.atrasadas ? 'perigo' : undefined}
        detalhe={resumo.atrasadas ? `${clientes(resumo.atrasadas)} devendo` : 'ninguém devendo'}>
        {formatarDinheiro(resumo.atrasado_centavos)}
      </Numero>
    </div>
  );
}

function Grupo({ grupo, itens, enviando, onPagar, onEditar }) {
  const comHospedagem = COM_HOSPEDAGEM.includes(grupo.tipo);
  const total = itens.filter((m) => m.situacao === 'em_dia' || m.situacao === 'atrasada').reduce((s, m) => s + m.mensalidade_valor_centavos, 0);
  return (
    <section className="cartao">
      <header className="cartao-grafico__topo">
        <h2>{grupo.nome}</h2>
        <span className="cartao-grafico__sub">{formatarDinheiro(total)} por mês</span>
      </header>
      <table className="tabela tabela--mensalidades">
        <thead>
          <tr>
            <th>Cliente</th><th className="num">Valor/mês</th><th>Situação</th><th>Próxima cobrança</th>
            {comHospedagem && <th>Site</th>}
            <th><span className="sr-only">Ações</span></th>
          </tr>
        </thead>
        <tbody>
          {itens.map((m) => (
            <tr key={m.projeto_id} className={m.atrasadas ? 'tabela__linha--atrasada' : undefined}>
              <td>
                <Link className="tabela__titulo" to={paginaDo(m)}>{m.cliente_nome}</Link>
                {m.titulo !== m.cliente_nome && <span className="tabela__sub">{m.titulo}</span>}
              </td>
              <td className="num tabela__dinheiro">
                {formatarDinheiro(m.mensalidade_valor_centavos)}
                {m.mensalidade_dia_vencimento && <span className="tabela__sub">todo dia {m.mensalidade_dia_vencimento}</span>}
              </td>
              <td><Situacao item={m} /></td>
              <td><ProximaCobranca item={m} /></td>
              {comHospedagem && <td><Hospedagem hospedagem={m.hospedagem} /></td>}
              <td>
                <div className="acoes-linha">
                  {m.em_aberto && (
                    <button type="button" className="btn btn--pequeno" disabled={enviando} onClick={() => onPagar(m)}
                      aria-label={`Marcar paga a mensalidade de ${m.cliente_nome} de ${formatarData(m.em_aberto.vencimento)}`}>
                      Marcar paga
                    </button>
                  )}
                  <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => onEditar(m)}
                    aria-label={`Editar mensalidade de ${m.cliente_nome}`}>
                    Editar
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Situacao({ item }) {
  if (item.situacao === 'atrasada') {
    return (
      <>
        <span className="etiqueta etiqueta--atrasada">Atrasada</span>
        <span className="tabela__sub">{formatarDinheiro(item.atrasado_centavos)} desde {formatarData(item.atrasada_desde)}</span>
      </>
    );
  }
  if (item.situacao === 'aguardando') {
    return (
      <>
        <span className="etiqueta etiqueta--proposta">Ainda não começou</span>
        <span className="tabela__sub">{frasePrimeiraMensalidade(item)}</span>
      </>
    );
  }
  if (item.situacao === 'desligada') {
    return (
      <>
        <span className="etiqueta">Desligada</span>
        <span className="tabela__sub">ficou cobrança em aberto</span>
      </>
    );
  }
  return (
    <>
      <span className="etiqueta etiqueta--paga">Em dia</span>
      {item.ultima_paga && <span className="tabela__sub">última paga em {formatarData(item.ultima_paga.pago_em)}</span>}
    </>
  );
}

function ProximaCobranca({ item }) {
  if (item.proxima) {
    return (
      <>
        {formatarData(item.proxima.vencimento)}
        {item.proxima.valor_centavos !== item.mensalidade_valor_centavos && (
          <span className="tabela__sub">{formatarDinheiro(item.proxima.valor_centavos)}</span>
        )}
      </>
    );
  }
  if (item.situacao === 'em_dia' || item.situacao === 'atrasada') {
    return <span className="vazio">a do mês que vem aparece no dia {item.mensalidade_dia_vencimento}</span>;
  }
  return <span className="vazio">—</span>;
}

function Hospedagem({ hospedagem }) {
  if (!hospedagem) return <span className="vazio">sem cadastro</span>;
  if (hospedagem.tipo === 'sem_hospedagem') return <span className="vazio">fica com o cliente</span>;
  const rotulo = ROTULO_STATUS[hospedagem.status] ?? ROTULO_STATUS.desconhecido;
  const tom = { no_ar: 'paga', fora_do_ar: 'atrasada', pausado: 'proposta' }[hospedagem.status];
  return <span className={`etiqueta${tom ? ` etiqueta--${tom}` : ''}`}>{rotulo}</span>;
}

function valoresIniciais(item) {
  return {
    mensalidade_ativa: Boolean(item.mensalidade_ativa),
    mensalidade_valor: item.mensalidade_valor_centavos ? centavosParaTexto(item.mensalidade_valor_centavos) : '',
    mensalidade_dia_vencimento: item.mensalidade_dia_vencimento ? String(item.mensalidade_dia_vencimento) : '',
    dia_manual: Boolean(item.mensalidade_dia_vencimento),
    mensalidade_inicio_modo: item.mensalidade_inicio_modo ?? 'entrega',
    mensalidade_inicio_data: item.mensalidade_inicio_data ?? '',
    data_inicio: item.data_inicio,
    data_entrega: item.data_entrega,
    apagar_mensalidades_abertas: false,
  };
}

// Grava no mesmo cadastro que o formulário do projeto: só os campos da mensalidade.
function EditarMensalidade({ item, onFechar, onSalvo }) {
  const [valores, setValores] = useState(() => valoresIniciais(item));
  const { erros, erro, enviando, executar, setErros } = useEnvio();
  const alterar = (parcial) => setValores((v) => comDiaSugerido({ ...v, ...parcial }));
  const ehSite = item.servico === 'site_sistema';

  function salvar(e) {
    e.preventDefault();
    const centavos = valores.mensalidade_ativa ? paraCentavos(valores.mensalidade_valor) : item.mensalidade_valor_centavos;
    if (valores.mensalidade_ativa && (centavos === null || Number.isNaN(centavos))) {
      setErros([{ campo: 'mensalidade_valor_centavos', mensagem: 'Valor inválido' }]);
      return;
    }
    const corpo = {
      mensalidade_ativa: valores.mensalidade_ativa,
      mensalidade_valor_centavos: centavos ?? 0,
      mensalidade_dia_vencimento: valores.mensalidade_dia_vencimento ? Number(valores.mensalidade_dia_vencimento) : null,
      apagar_mensalidades_abertas: valores.apagar_mensalidades_abertas,
    };
    if (ehSite) {
      corpo.mensalidade_inicio_modo = valores.mensalidade_inicio_modo;
      corpo.mensalidade_inicio_data = valores.mensalidade_inicio_modo === 'data' ? valores.mensalidade_inicio_data : null;
    }
    executar(async () => {
      await api(`/projetos/${item.projeto_id}`, { method: 'PUT', body: corpo });
      onSalvo();
    });
  }

  return (
    <Modal titulo={`Mensalidade · ${item.cliente_nome}`} onFechar={onFechar}>
      <form onSubmit={salvar} noValidate>
        {item.titulo !== item.cliente_nome && <p className="vazio">{item.titulo}</p>}
        <CobrancaMensal valores={valores} alterar={alterar} erros={erros} comInicio={ehSite} ativaAntes={Boolean(item.mensalidade_ativa)} />
        <p className="form__ajuda">
          Mudar o valor ou o dia vale para as cobranças que ainda não venceram. As atrasadas continuam com o valor combinado.
        </p>
        <Aviso erro={erros.length ? null : erro} />
        <div className="form--linha">
          <button className="btn btn--primario" disabled={enviando}>Salvar</button>
          <button type="button" className="btn" onClick={onFechar}>Cancelar</button>
        </div>
      </form>
    </Modal>
  );
}
