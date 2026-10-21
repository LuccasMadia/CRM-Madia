import { useState } from 'react';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { Campo } from '../../components/Campo.jsx';
import { Aviso } from '../../components/Aviso.jsx';
import { Modal } from '../../components/Modal.jsx';
import { paraCentavos, centavosParaTexto, formatarDinheiro } from '../../lib/dinheiro.js';

const ROTULO_HOSPEDAGEM = { obrigatoria: 'Obrigatória', opcional: 'Opcional', nao_se_aplica: 'Não se aplica' };

function descreverValor(s) {
  if (s.tipo === 'placa') return 'preço do modelo (em Placas)';
  const partes = [];
  if (s.valor_unico_centavos > 0) partes.push(formatarDinheiro(s.valor_unico_centavos));
  if (s.valor_mensal_centavos > 0) partes.push(`${formatarDinheiro(s.valor_mensal_centavos)}/mês`);
  return partes.join(' + ') || 'sem valor';
}

export function TabelaPrecos() {
  const { dados, erro, recarregar } = useCarregar(() => api('/tabela-precos'), []);
  const [servicoAberto, setServicoAberto] = useState(null); // 'novo' | serviço
  const [pacoteAberto, setPacoteAberto] = useState(null); // 'novo' | pacote
  const envio = useEnvio();
  const servicos = dados?.servicos ?? [];
  const nomeServico = (id) => servicos.find((s) => s.id === id)?.nome ?? 'serviço removido';

  function alternarAtivo(s) {
    envio.executar(async () => {
      await api(`/tabela-precos/servicos/${s.id}`, { method: 'PUT', body: { ativo: !s.ativo } });
      recarregar();
    });
  }

  function apagarServico(s) {
    if (!window.confirm(`Apagar o serviço "${s.nome}"?`)) return;
    envio.executar(async () => {
      await api(`/tabela-precos/servicos/${s.id}`, { method: 'DELETE' });
      recarregar();
    });
  }

  function mover(i, j) {
    const ids = servicos.map((s) => s.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    envio.executar(async () => {
      await api('/tabela-precos/servicos/ordem', { method: 'PUT', body: { ids } });
      recarregar();
    });
  }

  function apagarPacote(p) {
    if (!window.confirm(`Apagar o pacote "${p.nome}"?`)) return;
    envio.executar(async () => {
      await api(`/tabela-precos/pacotes/${p.id}`, { method: 'DELETE' });
      recarregar();
    });
  }

  const salvou = () => {
    setServicoAberto(null);
    setPacoteAberto(null);
    recarregar();
  };

  return (
    <section className="cartao">
      <h2>Tabela de preços</h2>
      <Aviso erro={erro} />
      <Aviso erro={envio.erro} />

      <h3>Serviços</h3>
      <ul className="lista lista-cadastro">
        {servicos.map((s, i) => (
          <li key={s.id}>
            <span className="lista-cadastro__nome">
              {s.nome} <small>{descreverValor(s)}</small>{' '}
              {!s.ativo && <small className="selo-prototipo">inativo</small>}
            </span>
            {i > 0 && <button type="button" className="btn btn--pequeno" aria-label={`Subir ${s.nome}`} onClick={() => mover(i, i - 1)}>↑</button>}
            {i < servicos.length - 1 && <button type="button" className="btn btn--pequeno" aria-label={`Descer ${s.nome}`} onClick={() => mover(i, i + 1)}>↓</button>}
            <button type="button" className="btn btn--pequeno" aria-label={`Editar ${s.nome}`} onClick={() => setServicoAberto(s)}>Editar</button>
            <button type="button" className="btn btn--pequeno" aria-label={`${s.ativo ? 'Desativar' : 'Ativar'} ${s.nome}`} onClick={() => alternarAtivo(s)}>
              {s.ativo ? 'Desativar' : 'Ativar'}
            </button>
            <button type="button" className="btn btn--pequeno btn--perigo" aria-label={`Apagar ${s.nome}`} onClick={() => apagarServico(s)}>Apagar</button>
          </li>
        ))}
      </ul>
      <button type="button" className="btn" onClick={() => setServicoAberto('novo')}>Novo serviço</button>

      <h3>Pacotes</h3>
      <ul className="lista lista-cadastro">
        {(dados?.pacotes ?? []).map((p) => (
          <li key={p.id}>
            <span className="lista-cadastro__nome">
              {p.nome}{' '}
              <small>{p.itens.map((it) => nomeServico(it.servico_id) + (it.opcional ? ' (opcional)' : '')).join(', ')}</small>
            </span>
            <button type="button" className="btn btn--pequeno" aria-label={`Editar pacote ${p.nome}`} onClick={() => setPacoteAberto(p)}>Editar</button>
            <button type="button" className="btn btn--pequeno btn--perigo" aria-label={`Apagar pacote ${p.nome}`} onClick={() => apagarPacote(p)}>Apagar</button>
          </li>
        ))}
      </ul>
      <button type="button" className="btn" onClick={() => setPacoteAberto('novo')}>Novo pacote</button>

      {dados && <ComboConfig inicial={dados} />}

      {servicoAberto && (
        <FormServico servico={servicoAberto === 'novo' ? null : servicoAberto} onFechar={() => setServicoAberto(null)} onSalvo={salvou} />
      )}
      {pacoteAberto && (
        <FormPacote pacote={pacoteAberto === 'novo' ? null : pacoteAberto} servicos={servicos} onFechar={() => setPacoteAberto(null)} onSalvo={salvou} />
      )}
    </section>
  );
}

function FormServico({ servico, onFechar, onSalvo }) {
  const [v, setV] = useState({
    nome: servico?.nome ?? '',
    frase: servico?.frase ?? '',
    unico: centavosParaTexto(servico?.valor_unico_centavos ?? 0),
    mensal: centavosParaTexto(servico?.valor_mensal_centavos ?? 0),
    hospedagem: servico?.hospedagem ?? 'nao_se_aplica',
  });
  const { erros, erro, enviando, executar, setErros } = useEnvio();
  const tipo = servico?.tipo ?? 'comum';
  const muda = (k) => ({ value: v[k], onChange: (e) => setV((x) => ({ ...x, [k]: e.target.value })) });

  function salvar(e) {
    e.preventDefault();
    const corpo = { nome: v.nome, frase: v.frase };
    if (tipo !== 'placa') {
      const unico = paraCentavos(v.unico) ?? 0;
      if (Number.isNaN(unico)) return setErros([{ campo: 'valor_unico_centavos', mensagem: 'Valor inválido' }]);
      corpo.valor_unico_centavos = unico;
    }
    if (tipo === 'comum' || tipo === 'hospedagem') {
      const mensal = paraCentavos(v.mensal) ?? 0;
      if (Number.isNaN(mensal)) return setErros([{ campo: 'valor_mensal_centavos', mensagem: 'Valor inválido' }]);
      corpo.valor_mensal_centavos = mensal;
    }
    if (tipo === 'comum') corpo.hospedagem = v.hospedagem;
    executar(async () => {
      await api(servico ? `/tabela-precos/servicos/${servico.id}` : '/tabela-precos/servicos', { method: servico ? 'PUT' : 'POST', body: corpo });
      onSalvo();
    });
  }

  return (
    <Modal titulo={servico ? 'Editar serviço' : 'Novo serviço'} onFechar={onFechar}>
      <form onSubmit={salvar} className="form" noValidate>
        <Campo rotulo="Nome" nome="nome" erros={erros} {...muda('nome')} />
        <Campo rotulo="Frase" nome="frase" erros={erros} {...muda('frase')} />
        {tipo === 'placa' ? (
          <p>Preço do modelo (em Placas).</p>
        ) : (
          <Campo rotulo="Valor único (R$)" nome="valor_unico_centavos" erros={erros} inputMode="decimal" {...muda('unico')} />
        )}
        {(tipo === 'comum' || tipo === 'hospedagem') && (
          <Campo rotulo="Valor mensal (R$)" nome="valor_mensal_centavos" erros={erros} inputMode="decimal" {...muda('mensal')} />
        )}
        {tipo === 'comum' && (
          <Campo rotulo="Hospedagem" nome="hospedagem" erros={erros}>
            <select {...muda('hospedagem')}>
              {Object.entries(ROTULO_HOSPEDAGEM).map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}
            </select>
          </Campo>
        )}
        <Aviso erro={erro} />
        <div><button className="btn btn--primario" disabled={enviando}>Salvar serviço</button></div>
      </form>
    </Modal>
  );
}

function FormPacote({ pacote, servicos, onFechar, onSalvo }) {
  const [nome, setNome] = useState(pacote?.nome ?? '');
  // escolhidos: servico_id -> { opcional, quantidade, placa_modelo_id }
  const [escolhidos, setEscolhidos] = useState(() =>
    Object.fromEntries(
      (pacote?.itens ?? []).map((it) => [
        it.servico_id,
        { opcional: Boolean(it.opcional), quantidade: it.quantidade ?? 1, placa_modelo_id: it.placa_modelo_id ?? null },
      ]),
    ),
  );
  const { erros, erro, enviando, executar } = useEnvio();

  function incluir(id, marcado) {
    setEscolhidos((e) => {
      const { [id]: _removido, ...resto } = e;
      return marcado ? { ...resto, [id]: { opcional: false, quantidade: 1, placa_modelo_id: null } } : resto;
    });
  }
  const opcional = (id, valor) => setEscolhidos((e) => ({ ...e, [id]: { ...e[id], opcional: valor } }));

  function salvar(e) {
    e.preventDefault();
    const itens = servicos.filter((s) => escolhidos[s.id]).map((s) => ({ servico_id: s.id, ...escolhidos[s.id] }));
    executar(async () => {
      await api(pacote ? `/tabela-precos/pacotes/${pacote.id}` : '/tabela-precos/pacotes', { method: pacote ? 'PUT' : 'POST', body: { nome, itens } });
      onSalvo();
    });
  }

  return (
    <Modal titulo={pacote ? 'Editar pacote' : 'Novo pacote'} onFechar={onFechar}>
      <form onSubmit={salvar} className="form" noValidate>
        <Campo rotulo="Nome do pacote" nome="nome" erros={erros} value={nome} onChange={(e) => setNome(e.target.value)} />
        <fieldset>
          <legend>Itens do pacote</legend>
          {servicos.map((s) => (
            <div key={s.id}>
              <label>
                <input type="checkbox" aria-label={`Incluir ${s.nome}`} checked={Boolean(escolhidos[s.id])} onChange={(e) => incluir(s.id, e.target.checked)} /> {s.nome}
              </label>{' '}
              {escolhidos[s.id] && (
                <label>
                  <input type="checkbox" aria-label={`Opcional: ${s.nome}`} checked={escolhidos[s.id].opcional} onChange={(e) => opcional(s.id, e.target.checked)} /> opcional
                </label>
              )}
            </div>
          ))}
        </fieldset>
        <Aviso erro={erro} />
        <div><button className="btn btn--primario" disabled={enviando}>Salvar pacote</button></div>
      </form>
    </Modal>
  );
}

function ComboConfig({ inicial }) {
  const [desconto, setDesconto] = useState(String(inicial.desconto_combo_pct ?? 10));
  const [whatsapp, setWhatsapp] = useState(inicial.contato_whatsapp ?? '');
  const { erros, erro, enviando, executar } = useEnvio();
  const [salvo, setSalvo] = useState(false);

  function salvar(e) {
    e.preventDefault();
    setSalvo(false);
    executar(async () => {
      await api('/tabela-precos/config', { method: 'PUT', body: { desconto_combo_pct: Number(desconto), contato_whatsapp: whatsapp } });
      setSalvo(true);
    });
  }

  return (
    <form onSubmit={salvar} className="form" noValidate>
      <h3>Combo e contato</h3>
      <Campo rotulo="Desconto de combo (%)" nome="desconto_combo_pct" erros={erros} inputMode="numeric" value={desconto} onChange={(e) => setDesconto(e.target.value)} />
      <Campo rotulo="WhatsApp no PDF" nome="contato_whatsapp" erros={erros} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
      <Aviso erro={erro} />
      {salvo && <p className="aviso aviso--ok" role="status">Configuração salva.</p>}
      <div><button className="btn btn--primario" disabled={enviando}>Salvar combo</button></div>
    </form>
  );
}
