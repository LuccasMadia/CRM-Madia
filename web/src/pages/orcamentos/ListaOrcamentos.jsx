import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { Aviso } from '../../components/Aviso.jsx';
import { Campo } from '../../components/Campo.jsx';
import { Modal } from '../../components/Modal.jsx';
import { PedeAtencao } from '../../components/PedeAtencao.jsx';
import { Icone } from '../../components/Icone.jsx';
import { useConfirmacao } from '../../hooks/useConfirmacao.jsx';
import { notificar } from '../../lib/notificacoes.js';
import { formatarData } from '../../lib/datas.js';
import { ROTULO_SITUACAO, numeroOrcamento, resumoValor } from '../cliente/AbaOrcamentos.jsx';

const plural = (n, um, varios) => (n === 1 ? um : varios);

// Cada grupo da faixa "Pede atenção": com um orçamento só, o item leva direto a ele; com vários, filtra a lista.
const ATENCAO = {
  vencendo: {
    tom: 'perigo',
    teste: (o) => o.vencendo,
    um: (o) => `Nº ${numeroOrcamento(o.numero)} ${o.cliente_nome}: ${o.dias_para_vencer < 0 ? 'venceu sem resposta' : `vence ${quando(o.dias_para_vencer)}`}`,
    rotulo: 'enviados vencendo ou vencidos',
  },
  // o que já está vencendo aparece só no grupo de cima
  sem_resposta: {
    tom: 'atencao',
    teste: (o) => o.sem_resposta && !o.vencendo,
    um: (o) => `Nº ${numeroOrcamento(o.numero)} ${o.cliente_nome}: enviado há mais de 7 dias, sem resposta`,
    rotulo: 'enviados há mais de 7 dias, sem resposta',
  },
  parado: {
    tom: 'atencao',
    teste: (o) => o.parado,
    um: (o) => `Nº ${numeroOrcamento(o.numero)} ${o.cliente_nome}: rascunho parado há mais de 7 dias`,
    rotulo: 'rascunhos parados há mais de 7 dias',
  },
};

function quando(dias) {
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'amanhã';
  return `em ${dias} dias`;
}

function validade(o) {
  if (o.situacao === 'aceito' || o.situacao === 'recusado') return null;
  // só o enviado fica em vermelho: é o que o cliente pode deixar vencer
  const enviado = o.situacao === 'enviado';
  if (o.dias_para_vencer < 0) {
    const ha = -o.dias_para_vencer;
    return { texto: `vencido há ${ha} ${plural(ha, 'dia', 'dias')}`, perigo: enviado };
  }
  return { texto: `vence ${quando(o.dias_para_vencer)}`, perigo: enviado && o.dias_para_vencer <= 3 };
}

function itensAtencao(lista) {
  return Object.entries(ATENCAO).flatMap(([chave, grupo]) => {
    const deste = lista.filter(grupo.teste);
    if (!deste.length) return [];
    return [deste.length === 1
      ? { texto: grupo.um(deste[0]), tom: grupo.tom, para: `/orcamentos/${deste[0].id}` }
      : { texto: `${deste.length} ${grupo.rotulo}`, tom: grupo.tom, para: `/orcamentos?aba=orcamentos&atencao=${chave}` }];
  });
}

export function ListaOrcamentos() {
  const { dados: lista, erro, recarregar } = useCarregar(() => api('/orcamentos'), []);
  const [params, setParams] = useSearchParams();
  const [criando, setCriando] = useState(false);
  const [confirmar, dialogo] = useConfirmacao();

  function excluir(o) {
    confirmar({
      titulo: `Excluir o orçamento nº ${numeroOrcamento(o.numero)}?`,
      mensagem: o.gerou ? 'O que ele gerou (projetos e vendas) continua existindo.' : 'Os itens dele também serão excluídos.',
      onConfirmar: async () => {
        await api(`/orcamentos/${o.id}`, { method: 'DELETE' });
        notificar('Orçamento excluído');
        recarregar();
      },
    });
  }
  const situacao = ROTULO_SITUACAO[params.get('situacao')] ? params.get('situacao') : '';
  const atencao = ATENCAO[params.get('atencao')] ? params.get('atencao') : '';

  function filtrar(novos) {
    const proximo = { aba: 'orcamentos', situacao, atencao, ...novos };
    setParams(Object.fromEntries(Object.entries(proximo).filter(([, v]) => v)));
  }

  const visiveis = (lista ?? []).filter((o) => (!situacao || o.situacao === situacao) && (!atencao || ATENCAO[atencao].teste(o)));
  const contar = (s) => (lista ?? []).filter((o) => !s || o.situacao === s).length;

  return (
    <>
      <PedeAtencao itens={lista && itensAtencao(lista)} />
      <div className="filtros">
        <div className="pilulas" role="group" aria-label="Situação">
          {[['', 'Todos'], ...Object.entries(ROTULO_SITUACAO)].map(([valor, rotulo]) => (
            <button key={valor || 'todos'} type="button" className="pilula" aria-pressed={situacao === valor} onClick={() => filtrar({ situacao: valor })}>
              {rotulo} <span className="contador">{contar(valor)}</span>
            </button>
          ))}
        </div>
        <button type="button" className="btn btn--primario" onClick={() => setCriando(true)}>+ Orçamento</button>
      </div>
      {atencao && (
        <p className="filtro-ativo">
          <span>{`Mostrando só os ${ATENCAO[atencao].rotulo}`}</span>
          <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => filtrar({ atencao: '' })}>Mostrar todos</button>
        </p>
      )}
      <Aviso erro={erro} />
      <section className="cartao">
        {lista && (visiveis.length ? (
          <table className="tabela tabela--orcamentos">
            <thead>
              <tr><th>Nº</th><th>Cliente</th><th>Data</th><th>Situação</th><th className="num">Valor</th><th>Validade</th><th aria-label="Ações" /></tr>
            </thead>
            <tbody>
              {visiveis.map((o) => {
                const v = validade(o);
                return (
                  <tr key={o.id}>
                    <td><Link className="tabela__titulo" to={`/orcamentos/${o.id}`}>{`nº ${numeroOrcamento(o.numero)}`}</Link></td>
                    <td><Link className="tabela__titulo" to={`/clientes/${o.cliente_id}?aba=orcamentos`}>{o.cliente_nome || 'Sem empresa'}</Link></td>
                    <td>{formatarData(o.data)}</td>
                    <td><span className={`etiqueta etiqueta--${o.situacao}`}>{ROTULO_SITUACAO[o.situacao]}</span></td>
                    <td className="num tabela__dinheiro">{resumoValor(o.totais)}</td>
                    <td>
                      <span className="tabela__titulo">{formatarData(o.vence_em)}</span>
                      {v && <span className={`tabela__sub${v.perigo ? ' texto-perigo' : ''}`}>{v.texto}</span>}
                    </td>
                    <td className="num">
                      <button type="button" className="btn btn--icone btn--icone-perigo" aria-label={`Excluir orçamento nº ${numeroOrcamento(o.numero)}`} title="Excluir" onClick={() => excluir(o)}>
                        <Icone nome="fechar" tamanho={18} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <p className="vazio">{lista.length ? 'Nenhum orçamento com esse filtro.' : 'Nenhum orçamento ainda.'}</p>)}
      </section>
      {criando && <NovoOrcamento onFechar={() => setCriando(false)} />}
      {dialogo}
    </>
  );
}

function NovoOrcamento({ onFechar }) {
  const navegar = useNavigate();
  const { dados: clientes, erro: erroCarga } = useCarregar(() => api('/clientes'), []);
  const [clienteId, setClienteId] = useState('');
  const { erros, erro, enviando, executar, setErros } = useEnvio();

  function criar(e) {
    e.preventDefault();
    if (!clienteId) return setErros([{ campo: 'cliente', mensagem: 'Escolha o cliente' }]);
    return executar(async () => {
      const criado = await api(`/clientes/${clienteId}/orcamentos`, { method: 'POST' });
      navegar(`/orcamentos/${criado.id}`);
    });
  }

  return (
    <Modal titulo="Novo orçamento" onFechar={onFechar}>
      <form className="form" onSubmit={criar} noValidate>
        <Aviso erro={erroCarga} />
        <Campo rotulo="Cliente" nome="cliente" erros={erros}>
          <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
            <option value="">{clientes ? 'Escolha o cliente…' : 'Carregando…'}</option>
            {(clientes ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome || c.responsavel || 'Sem empresa'}</option>)}
          </select>
        </Campo>
        <Aviso erro={erro} />
        <div><button className="btn btn--primario" disabled={enviando}>Criar orçamento</button></div>
      </form>
    </Modal>
  );
}
