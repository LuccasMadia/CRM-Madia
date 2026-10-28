import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useAcoesGmn } from '../../hooks/useAcoesGmn.js';
import { parcelaUnica } from '../../hooks/useParcelas.js';
import { Aviso } from '../../components/Aviso.jsx';
import { Modal } from '../../components/Modal.jsx';
import { FormGmn } from '../../components/FormGmn.jsx';
import { Icone } from '../../components/Icone.jsx';
import { PedeAtencao } from '../../components/PedeAtencao.jsx';
import { formatarDinheiro } from '../../lib/dinheiro.js';
import { formatarData, diasDesde, diaLocal } from '../../lib/datas.js';
import { CobrancaServico } from '../cliente/CobrancaServico.jsx';

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const pendente = (p) => p.etapa !== 'entregue' && p.etapa !== 'perdido';
const diasEsperando = (p) => (p.criado_em ? diasDesde(diaLocal(p.criado_em)) : 0);
const RECEBIMENTOS = '/financeiro?aba=recebimentos';

// Só o que pede ação agora: configurar quem está esperando e cobrar o que venceu ou vai vencer.
function itensAtencao(projetos, parcelas) {
  const itens = [];
  const pendentes = projetos.filter(pendente);
  if (pendentes.length) {
    const espera = Math.max(...pendentes.map(diasEsperando));
    itens.push({
      texto: `${plural(pendentes.length, 'pendente', 'pendentes')} de configurar${espera > 0 ? ` · o mais antigo há ${plural(espera, 'dia', 'dias')}` : ''}`,
      tom: espera > 7 ? 'atencao' : undefined,
    });
  }
  const abertas = parcelas.filter((p) => !p.pago_em);
  const soma = (lista) => formatarDinheiro(lista.reduce((s, p) => s + p.valor_centavos, 0));
  const atrasadas = abertas.filter((p) => p.estado === 'atrasada');
  if (atrasadas.length) {
    itens.push({ texto: `${plural(atrasadas.length, 'parcela atrasada', 'parcelas atrasadas')} · ${soma(atrasadas)}`, tom: 'perigo', para: RECEBIMENTOS });
  }
  const vencendo = abertas.filter((p) => p.estado === 'pendente' && diasDesde(p.vencimento) >= -7);
  if (vencendo.length) {
    itens.push({ texto: `${plural(vencendo.length, 'parcela vence', 'parcelas vencem')} em até 7 dias · ${soma(vencendo)}`, tom: 'atencao', para: RECEBIMENTOS });
  }
  return itens;
}

function LinhaGmn({ projeto, parcelas, acoes, onEditar, onPago }) {
  const nome = projeto.loja_nome ? `${projeto.cliente_nome} · ${projeto.loja_nome}` : projeto.cliente_nome;
  const espera = diasEsperando(projeto);
  return (
    <tr className={projeto.etapa === 'perdido' ? 'tabela__linha--inativa' : undefined}>
      <td>
        <Link className="tabela__titulo" to={`/clientes/${projeto.cliente_id}?aba=gmn`}>{nome}</Link>
        {projeto.link_perfil && <a className="tabela__sub" href={projeto.link_perfil} target="_blank" rel="noreferrer">Ver perfil no Google ↗</a>}
      </td>
      <td>
        {projeto.etapa === 'entregue' && <span className="etiqueta etiqueta--entregue">{`Configurado em ${formatarData(projeto.data_entrega)}`}</span>}
        {projeto.etapa === 'perdido' && <span className="etiqueta etiqueta--perdido">Perdido</span>}
        {pendente(projeto) && (
          <span className="etiqueta etiqueta--andamento">{espera > 0 ? `Pendente há ${plural(espera, 'dia', 'dias')}` : 'Pendente desde hoje'}</span>
        )}
      </td>
      <td className="tabela__valor"><CobrancaServico projeto={projeto} parcelas={parcelas} onPago={onPago} /></td>
      <td className="tabela__acoes gmn__acoes">
        {pendente(projeto) && (
          <button type="button" className="btn btn--primario btn--pequeno" onClick={() => acoes.marcarConfigurado(projeto)}>Marcar configurado</button>
        )}
        <button type="button" className="btn btn--icone" aria-label={`Editar Google Meu Negócio de ${nome}`} title="Editar" onClick={() => onEditar(projeto)}>
          <Icone nome="lapis" tamanho={18} />
        </button>
        <button type="button" className="btn btn--icone btn--icone-perigo" aria-label={`Excluir Google Meu Negócio de ${nome}`} title="Excluir" onClick={() => acoes.excluir(projeto)}>
          <Icone nome="fechar" tamanho={18} />
        </button>
      </td>
    </tr>
  );
}

function NovoGmn({ onSalvar, onFechar }) {
  const { dados: clientes } = useCarregar(() => api('/clientes'), []);
  return (
    <Modal titulo="Novo Google Meu Negócio" onFechar={onFechar}>
      {clientes ? <FormGmn clientes={clientes} onSalvar={onSalvar} /> : <p className="vazio">Carregando clientes…</p>}
    </Modal>
  );
}

// Pendentes primeiro (quem espera há mais tempo no topo), depois os configurados; perdidos só se pedir.
export function GoogleMeuNegocio() {
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState(null);
  const [verPerdidos, setVerPerdidos] = useState(false);
  const { dados: projetos, erro, recarregar } = useCarregar(() => api('/projetos?servico=google_meu_negocio'), []);
  const { dados: parcelas, recarregar: recarregarParcelas } = useCarregar(() => api('/parcelas?servico=google_meu_negocio'), []);
  const mudou = () => { recarregar(); recarregarParcelas(); };
  const acoes = useAcoesGmn(mudou);

  // uma busca só para todas as linhas; projeto fictício não aparece em /parcelas e fica sem cobrança
  const parcelasDe = (p) => (parcelas ? parcelas.filter((pa) => pa.projeto_id === p.id) : null);
  const todos = projetos ?? [];
  const pendentes = todos.filter(pendente).sort((a, b) => (a.criado_em ?? '').localeCompare(b.criado_em ?? ''));
  const configurados = todos.filter((p) => p.etapa === 'entregue').sort((a, b) => (b.data_entrega ?? '').localeCompare(a.data_entrega ?? ''));
  const perdidos = todos.filter((p) => p.etapa === 'perdido');
  const blocos = [['Pendentes', pendentes], ['Configurados', configurados], ...(verPerdidos ? [['Perdidos', perdidos]] : [])]
    .filter(([, lista]) => lista.length);

  const linha = (p) => (
    <LinhaGmn key={p.id} projeto={p} parcelas={parcelasDe(p)} acoes={acoes} onEditar={setEditando} onPago={mudou} />
  );

  return (
    <div>
      <PedeAtencao itens={projetos && parcelas ? itensAtencao(projetos, parcelas) : null} />
      <div className="filtros">
        <div className="pilulas">
          {perdidos.length > 0 && (
            <button type="button" className="pilula" aria-pressed={verPerdidos} onClick={() => setVerPerdidos((v) => !v)}>
              {`Perdidos (${perdidos.length})`}
            </button>
          )}
        </div>
        <button type="button" className="btn btn--primario" onClick={() => setCriando(true)}>+ Google Meu Negócio</button>
      </div>
      <Aviso erro={erro ?? acoes.envio.erro} />
      {projetos && (blocos.length ? (
        <table className="tabela tabela--limpa">
          <thead>
            <tr><th>Cliente</th><th>Situação</th><th>Cobrança</th><th aria-label="Ações" /></tr>
          </thead>
          <tbody>
            {blocos.flatMap(([titulo, lista]) => [
              <tr key={titulo} className="tabela__divisoria"><td colSpan={4}>{`${titulo} (${lista.length})`}</td></tr>,
              ...lista.map(linha),
            ])}
          </tbody>
        </table>
      ) : <p className="vazio">Nenhum Google Meu Negócio ainda.</p>)}
      {criando && <NovoGmn onFechar={() => setCriando(false)} onSalvar={(corpo) => acoes.criar(corpo, () => setCriando(false))} />}
      {editando && (
        <Modal titulo="Editar Google Meu Negócio" onFechar={() => setEditando(null)}>
          <FormGmn
            clienteId={editando.cliente_id} projeto={editando} parcela={parcelaUnica(parcelasDe(editando))}
            onSalvar={(corpo) => acoes.salvar(editando, corpo, () => setEditando(null))}
          />
        </Modal>
      )}
      {acoes.dialogo}
    </div>
  );
}
