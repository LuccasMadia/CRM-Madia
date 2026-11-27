import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { useConfirmacao } from '../../hooks/useConfirmacao.jsx';
import { Aviso } from '../../components/Aviso.jsx';
import { Campo } from '../../components/Campo.jsx';
import { formatarData } from '../../lib/datas.js';

const comoMinuto = (t) => (t.length === 10 ? `${t}T00:00` : t);

function quando(evento) {
  const inicio = evento.dia_inteiro ? formatarData(evento.inicio) : `${formatarData(evento.inicio)} ${evento.inicio.slice(11, 16)}`;
  if (!evento.fim) return inicio;
  const fim = evento.dia_inteiro ? formatarData(evento.fim) : `${formatarData(evento.fim)} ${evento.fim.slice(11, 16)}`;
  return `${inicio} até ${fim}`;
}

// Formulário de um evento (novo ou existente). Evento recorrente vem somente leitura.
export function FormEvento({ evento = null, diaInicial, clientes = [], projetos = [], onSalvo, onExcluido }) {
  const { erros, erro, enviando, executar, setErros } = useEnvio();
  const [confirmar, dialogo] = useConfirmacao();
  const [titulo, setTitulo] = useState(evento?.titulo ?? '');
  const [diaInteiro, setDiaInteiro] = useState(Boolean(evento?.dia_inteiro));
  const [inicio, setInicio] = useState(evento?.inicio ?? `${diaInicial}T09:00`);
  const [fim, setFim] = useState(evento ? evento.fim ?? '' : `${diaInicial}T10:00`);
  const [local, setLocal] = useState(evento?.local ?? '');
  const [notas, setNotas] = useState(evento?.notas ?? '');
  const [clienteId, setClienteId] = useState(evento?.cliente_id ? String(evento.cliente_id) : '');
  const [projetoId, setProjetoId] = useState(evento?.projeto_id ? String(evento.projeto_id) : '');

  if (evento?.recorrente) {
    return (
      <div>
        <p className="aviso">Evento recorrente: é somente leitura aqui. Para mudar, edite no app Calendário.</p>
        <h3>{evento.titulo}</h3>
        <p>{quando(evento)}</p>
        {evento.local && <p>{evento.local}</p>}
        {evento.notas && <p>{evento.notas}</p>}
      </div>
    );
  }

  function alternarDiaInteiro(marcado) {
    setDiaInteiro(marcado);
    setInicio((v) => (marcado ? v.slice(0, 10) : `${v.slice(0, 10)}T09:00`));
    setFim((v) => (marcado ? v.slice(0, 10) : v ? `${v.slice(0, 10)}T10:00` : ''));
  }

  const projetosDoCliente = clienteId ? projetos.filter((p) => String(p.cliente_id) === clienteId) : projetos;

  function salvar(e) {
    e.preventDefault();
    if (fim && comoMinuto(fim) < comoMinuto(inicio)) {
      setErros([{ campo: 'fim', mensagem: 'O fim não pode ser antes do início' }]);
      return;
    }
    const corpo = {
      titulo, dia_inteiro: diaInteiro, inicio, fim: fim || null, local: local || null, notas: notas || null,
      cliente_id: clienteId ? Number(clienteId) : null, projeto_id: projetoId ? Number(projetoId) : null,
    };
    executar(async () => {
      const salvo = evento ? await api(`/eventos/${evento.id}`, { method: 'PUT', body: corpo }) : await api('/eventos', { method: 'POST', body: corpo });
      onSalvo(salvo);
    });
  }

  function excluir() {
    confirmar({
      titulo: `Excluir ${evento.titulo}?`,
      mensagem: evento.origem === 'apple' ? 'O evento também sai do app Calendário do iPhone.' : 'Não dá para desfazer.',
      onConfirmar: async () => { await api(`/eventos/${evento.id}`, { method: 'DELETE' }); onExcluido(); },
    });
  }

  const tipo = diaInteiro ? 'date' : 'datetime-local';
  return (
    <form className="form" onSubmit={salvar} noValidate>
      {evento?.pendente ? <p className="aviso">Este evento ainda não foi enviado ao iCloud. Ele sobe na próxima sincronização.</p> : null}
      <Campo rotulo="Título" nome="titulo" erros={erros} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
      <label className="campo--marcar">
        <input type="checkbox" checked={diaInteiro} onChange={(e) => alternarDiaInteiro(e.target.checked)} /> Dia inteiro
      </label>
      <Campo rotulo="Início" nome="inicio" erros={erros} type={tipo} value={inicio} onChange={(e) => setInicio(e.target.value)} />
      <Campo rotulo="Fim" nome="fim" erros={erros} type={tipo} value={fim} onChange={(e) => setFim(e.target.value)} />
      <Campo rotulo="Local" nome="local" erros={erros} value={local} onChange={(e) => setLocal(e.target.value)} />
      <Campo rotulo="Notas" nome="notas" erros={erros}>
        <textarea rows={3} value={notas} onChange={(e) => setNotas(e.target.value)} />
      </Campo>
      <Campo rotulo="Cliente" nome="cliente_id" erros={erros}>
        <select value={clienteId} onChange={(e) => { setClienteId(e.target.value); setProjetoId(''); }}>
          <option value="">Nenhum</option>
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Projeto" nome="projeto_id" erros={erros}>
        <select value={projetoId} onChange={(e) => setProjetoId(e.target.value)}>
          <option value="">Nenhum</option>
          {projetosDoCliente.map((p) => <option key={p.id} value={p.id}>{p.titulo}</option>)}
        </select>
      </Campo>
      {evento?.cliente_id || evento?.projeto_id ? (
        <p className="vazio">
          {evento.cliente_id && <Link to={`/clientes/${evento.cliente_id}`}>Abrir cliente</Link>}
          {evento.cliente_id && evento.projeto_id && ' · '}
          {evento.projeto_id && <Link to={`/projetos/${evento.projeto_id}`}>Abrir projeto</Link>}
        </p>
      ) : null}
      {!erros.length && <Aviso erro={erro} />}
      <div className="form--linha">
        <button className="btn btn--primario" disabled={enviando}>Salvar</button>
        {evento && <button type="button" className="btn btn--perigo" disabled={enviando} onClick={excluir}>Excluir</button>}
      </div>
      {dialogo}
    </form>
  );
}
