import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { useConfirmacao } from '../hooks/useConfirmacao.jsx';
import { notificar } from '../lib/notificacoes.js';
import { Aviso } from '../components/Aviso.jsx';
import { Campo } from '../components/Campo.jsx';
import { formatarDinheiro, paraCentavos, centavosParaTexto } from '../lib/dinheiro.js';
import { useValoresOcultos } from '../lib/privacidade.js';
import { ROTULO_SITUACAO, numeroOrcamento } from './cliente/AbaOrcamentos.jsx';
import { ConferenciaAceite, sugestoesDeVinculo, rotuloEtapaProjeto } from './orcamentos/ConferenciaAceite.jsx';
import { ABA_DO_SERVICO } from '../lib/rotulos.js';

// Conversores dos campos que salvam ao sair: devolvem { valor } para enviar ou { erro } para mostrar.
const comoTexto = (t) => ({ valor: t.trim() === '' ? null : t });
const comoObrigatorio = (mensagem) => (t) => (t.trim() === '' ? { erro: mensagem } : { valor: t.trim() });
const comoInteiro = (min, max = Infinity) => (t) => {
  const n = Number(t);
  return /^\d+$/.test(t.trim()) && n >= min && n <= max ? { valor: n } : { erro: `Informe um número inteiro${max < Infinity ? ` de ${min} a ${max}` : ` a partir de ${min}`}` };
};
const comoDinheiro = (t) => {
  const c = paraCentavos(t);
  return Number.isNaN(c) ? { erro: 'Valor inválido' } : { valor: c };
};

// Campo que guarda o texto enquanto se digita e só chama onSalvar ao sair, se o valor mudou.
// Quem usa passa key com o valor do servidor, para o campo recomeçar quando a resposta chega.
function CampoAoSair({ id, rotulo, rotuloAcessivel, texto, original, converter = comoTexto, onSalvar, multilinha, ...props }) {
  const [valor, setValor] = useState(texto ?? '');
  const [erro, setErro] = useState(null);
  const Controle = multilinha ? 'textarea' : 'input';

  function sair() {
    const r = converter(valor);
    setErro(r.erro ?? null);
    if (r.erro || (r.valor ?? '') === (original ?? '')) return;
    onSalvar(r.valor);
  }

  return (
    <div className="campo">
      <label htmlFor={id}>{rotulo}</label>
      <Controle
        id={id} aria-label={rotuloAcessivel} aria-invalid={Boolean(erro)} value={valor}
        onChange={(e) => setValor(e.target.value)} onBlur={sair} {...props}
      />
      {erro && <p className="campo__erro" role="alert">{erro}</p>}
    </div>
  );
}

const OPCOES_PAGAMENTO = ['a combinar', 'À vista no Pix', '50% de entrada + 50% na entrega', 'Parcelado no cartão'];
const OPCOES_PRAZO = ['a combinar', '7 dias', '15 dias', '30 dias', '45 dias', '60 dias'];
const OUTRO = '__outro';
// O mesmo teste está em server/orcamentos/pdf.js, que põe o aviso no PDF.
const AVISO_PARCELADO = 'Pagamento parcelado: será cobrada a taxa da maquininha.';
const ehParcelado = (t) => /parcel/i.test(t ?? '');

// Lista de opções prontas; "Outro" abre um campo para descrever o que não se encaixa.
function CampoOpcoes({ nome, rotulo, opcoes, valor, onSalvar }) {
  const [outro, setOutro] = useState(!opcoes.includes(valor));
  function escolher(v) {
    if (v === OUTRO) return setOutro(true);
    setOutro(false);
    return v !== valor && onSalvar(v);
  }
  return (
    <>
      <Campo rotulo={rotulo} nome={nome}>
        <select value={outro ? OUTRO : valor} onChange={(e) => escolher(e.target.value)}>
          {opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
          <option value={OUTRO}>Outro</option>
        </select>
      </Campo>
      {outro && (
        <CampoAoSair
          key={`${nome}-${valor}`} id={`orcamento-${nome}-outro`} rotulo={`${rotulo}: descreva`} autoFocus
          texto={opcoes.includes(valor) ? '' : valor} original={valor}
          converter={comoObrigatorio('Descreva ou escolha uma opção da lista')} onSalvar={onSalvar}
        />
      )}
    </>
  );
}

function ValorOculto({ rotulo, centavos }) {
  return (
    <div className="campo">
      <span className="orcamento__rotulo">{rotulo}</span>
      <span>{formatarDinheiro(centavos)}</span>
    </div>
  );
}

export function Orcamento() {
  const { id } = useParams();
  const navegar = useNavigate();
  const { dados: carregado, erro } = useCarregar(() => api(`/orcamentos/${id}`), [id]);
  const { dados: tabela, erro: erroTabela } = useCarregar(() => api('/tabela-precos'), []);
  // Depois de cada mudança, a tela mostra o orçamento que o servidor devolveu (sem recalcular aqui).
  const [atual, setAtual] = useState(null);
  // Vários campos salvam ao sair, então pedidos podem se cruzar: só a resposta do último pedido vale,
  // e os botões ficam travados enquanto houver qualquer pedido em andamento.
  const ultimoPedido = useRef(0);
  const [emAndamento, setEmAndamento] = useState(0);
  const pendentes = useRef(new Set());
  const [falha, setFalha] = useState(null);
  const ocupado = emAndamento > 0;
  const [conferindo, setConferindo] = useState(false);
  const [confirmar, dialogo] = useConfirmacao();

  const doId = (o) => (o?.id === Number(id) ? o : null);
  const orcamento = doId(atual) ?? doId(carregado);

  if (erro) return <Aviso erro={erro} />;
  if (!orcamento) return <p>Carregando…</p>;

  const numero = numeroOrcamento(orcamento.numero);
  const gerados = orcamento.gerados ?? { projetos: [], vendas: [] };
  const temGerados = gerados.projetos.length + gerados.vendas.length > 0;  const voltar = `/clientes/${orcamento.cliente_id}?aba=orcamentos`;
  const hospedagem = tabela?.servicos.find((s) => s.tipo === 'hospedagem' && s.ativo);
  const erroEnvio = falha && (falha.erros?.length ? { message: falha.erros.map((e) => e.mensagem).join('\n') } : falha);

  function rodar(fn) {
    const p = executar(fn);
    pendentes.current.add(p);
    p.finally(() => pendentes.current.delete(p));
    return p;
  }

  async function executar(fn) {
    setFalha(null);
    setEmAndamento((n) => n + 1);
    try {
      return await fn();
    } catch (e) {
      setFalha(e);
      return undefined;
    } finally {
      setEmAndamento((n) => n - 1);
    }
  }

  const aplicar = (caminho, opcoes) => {
    const pedido = ++ultimoPedido.current;
    const ehUltimo = () => pedido === ultimoPedido.current;
    return rodar(async () => {
      try {
        const resposta = await api(caminho, opcoes);
        if (ehUltimo()) setAtual(resposta);
        return resposta;
      } catch (e) {
        // O último falhou, mas um anterior pode ter gravado e sido ignorado: relê o que está no servidor.
        if (ehUltimo()) api(`/orcamentos/${id}`).then((o) => ehUltimo() && setAtual(o), () => {});
        throw e;
      }
    });
  };
  const salvar = (campos) => aplicar(`/orcamentos/${id}`, { method: 'PUT', body: campos });
  const adicionarItem = (corpo) => aplicar(`/orcamentos/${id}/itens`, { method: 'POST', body: corpo });

  // Os campos já salvam ao sair (o clique no botão tira o foco do campo): aqui só espera os envios terminarem.
  async function salvarTudo() {
    const respostas = await Promise.all([...pendentes.current]);
    if (!respostas.includes(undefined)) notificar('Orçamento salvo');
  }

  function duplicar() {
    rodar(async () => {
      const copia = await api(`/orcamentos/${id}/duplicar`, { method: 'POST' });
      setAtual(copia);
      navegar(`/orcamentos/${copia.id}`);
    });
  }

  function excluir() {
    confirmar({
      titulo: `Excluir o orçamento nº ${numero}?`,
      mensagem: temGerados ? 'O que ele gerou (projetos e vendas) continua existindo.' : 'Os itens dele também serão excluídos.',
      onConfirmar: async () => {
        await api(`/orcamentos/${id}`, { method: 'DELETE' });
        notificar('Orçamento excluído');
        navegar(voltar);
      },
    });
  }

  // Aceito passa pela conferência (cria projetos e vendas); sair de aceito pergunta o que fazer com o que foi gerado.
  function mudarSituacao(nova) {
    if (nova === 'aceito' && !temGerados) return setConferindo(true);
    if (orcamento.situacao === 'aceito' && temGerados) return perguntarDesfazer(nova);
    return salvar({ situacao: nova });
  }

  // Projeto vinculado (já existia) nunca é apagado: desfazer só o desvincula e apaga as parcelas abertas do aceite.
  function perguntarDesfazer(nova) {
    const { projetos, vendas } = gerados;
    const vinculados = projetos.filter((p) => p.vinculado);
    const itens = [
      ...projetos.filter((p) => !p.vinculado).map((p) => ({ ...linkDoGerado(p), pode: p.pode_apagar, motivo: 'tem parcela paga' })),
      ...vendas.map((v) => ({ ...linkDaVenda(v), pode: v.pode_apagar, motivo: 'já recebida ou com placa montada' })),
    ];
    const apagaveis = itens.filter((i) => i.pode);
    const mantidos = itens.filter((i) => !i.pode);
    const temDesfazer = apagaveis.length + vinculados.length > 0;
    const desfazer = (apagar) => async () => {
      setAtual(await api(`/orcamentos/${id}/desfazer`, { method: 'POST', body: { situacao: nova, apagar } }));
      notificar(apagar ? 'Desfeito o que ainda não tinha andado' : `Orçamento marcado como ${ROTULO_SITUACAO[nova].toLowerCase()}`);
    };
    let mensagem = 'Tudo o que este orçamento gerou já andou e vai continuar existindo.';
    if (apagaveis.length && vinculados.length) mensagem = 'Este orçamento gerou projetos e vendas e usou um projeto que já existia. Quer desfazer o que ele gerou?';
    else if (apagaveis.length) mensagem = 'Este orçamento gerou projetos e vendas. Quer apagar o que ele gerou?';
    else if (vinculados.length) mensagem = 'Este orçamento foi ligado a um projeto que já existia. Quer desfazer essa ligação?';
    confirmar({
      titulo: `Voltar para "${ROTULO_SITUACAO[nova]}"?`,
      mensagem,
      detalhe: (
        <div className="desfazer">
          {vinculados.length > 0 && (
            <>
              <p className="desfazer__titulo">Vinculado: não é apagado</p>
              <ul className="desfazer__lista">
                {vinculados.map((p) => (
                  <li key={p.id}>
                    <Link to={linkDoGerado(p).para}>{p.titulo}</Link>
                    {` foi vinculado: continua existindo, só é desvinculado; ${p.parcelas_abertas
                      ? `${p.parcelas_abertas} ${p.parcelas_abertas === 1 ? 'parcela aberta do orçamento é apagada' : 'parcelas abertas do orçamento são apagadas'}`
                      : 'não há parcela aberta do orçamento para apagar'}. Etapa, valor e mensalidade ficam como estão.`}
                  </li>
                ))}
              </ul>
            </>
          )}
          {apagaveis.length > 0 && <ListaGerados titulo="Pode ser apagado" itens={apagaveis} />}
          {mantidos.length > 0 && <ListaGerados titulo="Já andou e fica" itens={mantidos} comMotivo />}
        </div>
      ),
      rotuloConfirmar: vinculados.length ? 'Desfazer o que foi gerado' : 'Apagar o que foi gerado',
      onConfirmar: temDesfazer ? desfazer(true) : undefined,
      alternativa: { rotulo: temDesfazer ? 'Manter e só mudar a situação' : 'Mudar a situação', onEscolher: desfazer(false) },
    });
  }

  const campo = (nome) => ({ id: `orcamento-${nome}`, original: orcamento[nome], onSalvar: (v) => salvar({ [nome]: v }) });

  return (
    <section className="orcamento">
      <header className="pagina__topo">
        <div>
          <p className="sobretitulo"><Link to={voltar}>{orcamento.cliente_nome || 'Sem empresa'}</Link></p>
          <h1>{`Orçamento nº ${numero} — ${orcamento.cliente_nome || 'Sem empresa'}`}</h1>
        </div>
        <div className="orcamento__acoes">
          <Campo rotulo="Situação" nome="situacao">
            <select value={orcamento.situacao} onChange={(e) => mudarSituacao(e.target.value)}>
              {Object.entries(ROTULO_SITUACAO).map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}
            </select>
          </Campo>
          {/* Não trava com ocupado: o clique que tira o foco de um campo dispara o envio antes do onClick. */}
          <button type="button" className="btn btn--primario" onClick={salvarTudo}>Salvar</button>
          <a
            className={`btn${ocupado ? ' btn--desabilitado' : ''}`} href={`/api/orcamentos/${id}/pdf`} download
            aria-disabled={ocupado || undefined} onClick={(e) => { if (ocupado) e.preventDefault(); }}
          >Baixar PDF</a>
          <button type="button" className="btn" onClick={duplicar} disabled={ocupado}>Duplicar</button>
          <button type="button" className="btn btn--perigo" onClick={excluir} disabled={ocupado}>Excluir</button>
        </div>
      </header>
      <Gerou gerados={gerados} />
      <AvisoVinculo orcamento={orcamento} />
      <Aviso erro={erroTabela} />
      <Aviso erro={erroEnvio} />

      <div className="cartao">
        <h2>Itens</h2>
        {tabela && <Adicionar tabela={tabela} enviando={ocupado} onItem={adicionarItem} onPacote={(corpo) => aplicar(`/orcamentos/${id}/pacote`, { method: 'POST', body: corpo })} />}
        {orcamento.sugerir_hospedagem && hospedagem && (
          <div className="aviso orcamento__sugestao">
            <span>Este site pode ter hospedagem e suporte.</span>{' '}
            <button type="button" className="btn btn--pequeno" disabled={ocupado} onClick={() => adicionarItem({ servico_id: hospedagem.id })}>Adicionar</button>
          </div>
        )}
        {orcamento.itens.length === 0 && <p className="vazio">Nenhum item ainda. Escolha um serviço ou pacote acima.</p>}
        <ul className="orcamento__itens">
          {orcamento.itens.map((item) => (
            <ItemLinha
              key={item.id} item={item} ocupado={ocupado}
              onSalvar={(campos) => aplicar(`/orcamentos/${id}/itens/${item.id}`, { method: 'PUT', body: campos })}
              onRemover={() => aplicar(`/orcamentos/${id}/itens/${item.id}`, { method: 'DELETE' })}
            />
          ))}
        </ul>
      </div>

      <Totais orcamento={orcamento} ocupado={ocupado} descontoPadrao={tabela?.desconto_combo_pct ?? 10} onSalvar={salvar} />

      <div className="cartao">
        <h2>Condições</h2>
        <div className="orcamento__campos">
          <CampoAoSair key={`data-${orcamento.data}`} {...campo('data')} rotulo="Data" type="date" texto={orcamento.data} converter={comoObrigatorio('Informe a data')} />
          <CampoAoSair key={`validade_dias-${orcamento.validade_dias}`} {...campo('validade_dias')} rotulo="Validade (dias)" inputMode="numeric" texto={String(orcamento.validade_dias)} converter={comoInteiro(1)} />
          <CampoOpcoes key={`pagamento-${id}`} nome="pagamento" rotulo="Forma de pagamento" opcoes={OPCOES_PAGAMENTO} valor={orcamento.pagamento} onSalvar={campo('pagamento').onSalvar} />
          <CampoOpcoes key={`prazo-${id}`} nome="prazo" rotulo="Prazo" opcoes={OPCOES_PRAZO} valor={orcamento.prazo} onSalvar={campo('prazo').onSalvar} />
          {ehParcelado(orcamento.pagamento) && <p className="vazio orcamento__aviso-parcelado">{`${AVISO_PARCELADO} Esse aviso sai no PDF.`}</p>}
          <CampoAoSair key={`observacao-${orcamento.observacao}`} {...campo('observacao')} rotulo="Observação" texto={orcamento.observacao} multilinha rows={3} />
        </div>
      </div>
      {conferindo && (
        <ConferenciaAceite
          orcamento={orcamento} onFechar={() => setConferindo(false)}
          onAceito={(resposta) => { setAtual(resposta); setConferindo(false); notificar('Orçamento aceito'); }}
        />
      )}
      {dialogo}
    </section>
  );
}

const linkDoGerado = (p) => ({
  chave: `p${p.id}`,
  para: p.servico === 'site_sistema' ? `/projetos/${p.id}` : `/clientes/${p.cliente_id}?aba=${ABA_DO_SERVICO[p.servico]}`,
  texto: p.titulo,
});
const linkDaVenda = (v) => ({
  chave: `v${v.id}`,
  para: '/servicos?aba=placas&placas=vendas',
  texto: `Venda de ${v.quantidade} ${v.quantidade === 1 ? 'placa' : 'placas'} ${v.modelo_nome}`,
});

// O que o aceite criou e os projetos que já existiam e ele passou a usar, com link para cada um.
function Gerou({ gerados }) {
  const criou = [...gerados.projetos.filter((p) => !p.vinculado).map(linkDoGerado), ...gerados.vendas.map(linkDaVenda)];
  const vinculou = gerados.projetos.filter((p) => p.vinculado).map(linkDoGerado);
  const linha = (rotulo, links) => links.length > 0 && (
    <p className="orcamento__gerou">
      <span>{rotulo}</span>
      {links.map((l) => <Link key={l.chave} className="etiqueta etiqueta--aceito" to={l.para}>{l.texto}</Link>)}
    </p>
  );
  return <>{linha('Vinculou:', vinculou)}{linha('Criou:', criou)}</>;
}

// Antes de aceitar: avisa que o cliente já tem um projeto aberto que a conferência vai sugerir usar.
function AvisoVinculo({ orcamento }) {
  if (orcamento.situacao === 'aceito') return null;
  return sugestoesDeVinculo(orcamento).map((p) => (
    <p key={p.id} className="vazio orcamento__vinculo">
      {`${orcamento.cliente_nome || 'O cliente'} já tem "${p.titulo}" em ${rotuloEtapaProjeto(p)} — ao aceitar você pode usar esse projeto.`}
    </p>
  ));
}

function ListaGerados({ titulo, itens, comMotivo }) {
  return (
    <>
      <p className="desfazer__titulo">{titulo}</p>
      <ul className="desfazer__lista">
        {itens.map((i) => (
          <li key={i.chave}><Link to={i.para}>{i.texto}</Link>{comMotivo && <span className="vazio">{` (${i.motivo})`}</span>}</li>
        ))}
      </ul>
    </>
  );
}

function Adicionar({ tabela, enviando, onItem, onPacote }) {
  const [escolha, setEscolha] = useState(null); // { tipo: 'placa', servico } | { tipo: 'pacote', pacote } | { tipo: 'livre' }
  const servicos = tabela.servicos.filter((s) => s.ativo);
  const concluir = (promessa) => promessa.then((r) => r && setEscolha(null));

  function escolher(valor) {
    const [tipo, idTexto] = valor.split(':');
    const idEscolhido = Number(idTexto);
    if (tipo === 'livre') return setEscolha({ tipo: 'livre' });
    if (tipo === 'p') return setEscolha({ tipo: 'pacote', pacote: tabela.pacotes.find((p) => p.id === idEscolhido) });
    const servico = servicos.find((s) => s.id === idEscolhido);
    if (!servico) return undefined;
    if (servico.tipo === 'placa') return setEscolha({ tipo: 'placa', servico });
    setEscolha(null);
    return onItem({ servico_id: servico.id });
  }

  return (
    <div className="orcamento__adicionar">
      <Campo rotulo="Adicionar" nome="adicionar">
        <select value="" onChange={(e) => escolher(e.target.value)} disabled={enviando}>
          <option value="">Escolha um serviço ou pacote…</option>
          <optgroup label="Serviços">
            {servicos.map((s) => <option key={s.id} value={`s:${s.id}`}>{s.nome}</option>)}
          </optgroup>
          {tabela.pacotes.length > 0 && (
            <optgroup label="Pacotes">
              {tabela.pacotes.map((p) => <option key={p.id} value={`p:${p.id}`}>{p.nome}</option>)}
            </optgroup>
          )}
          <option value="livre">Item livre</option>
        </select>
      </Campo>
      {escolha?.tipo === 'placa' && (
        <FormPlaca key={escolha.servico.id} servico={escolha.servico} enviando={enviando} onCancelar={() => setEscolha(null)} onEnviar={(corpo) => concluir(onItem(corpo))} />
      )}
      {escolha?.tipo === 'pacote' && (
        <FormPacote
          key={escolha.pacote.id} pacote={escolha.pacote} servicos={tabela.servicos} enviando={enviando}
          onCancelar={() => setEscolha(null)} onEnviar={(corpo) => concluir(onPacote(corpo))}
        />
      )}
      {escolha?.tipo === 'livre' && (
        <FormLivre enviando={enviando} onCancelar={() => setEscolha(null)} onEnviar={(corpo) => concluir(onItem(corpo))} />
      )}
    </div>
  );
}

// Só monta quando precisa de placa, então a lista de modelos só é buscada nessa hora.
function SeletorModelo({ valor, onMudar, erro }) {
  const { dados: modelos, erro: erroCarga } = useCarregar(() => api('/placas/modelos'), []);
  const erros = erro ? [{ campo: 'placa_modelo_id', mensagem: erro }] : [];
  return (
    <>
      <Aviso erro={erroCarga} />
      <Campo rotulo="Modelo da placa" nome="placa_modelo_id" erros={erros}>
        <select value={valor} onChange={(e) => onMudar(e.target.value)}>
          <option value="">{modelos ? 'Escolha o modelo…' : 'Carregando…'}</option>
          {(modelos ?? []).filter((m) => m.ativo).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>
      </Campo>
    </>
  );
}

function FormPlaca({ servico, enviando, onCancelar, onEnviar }) {
  const [modelo, setModelo] = useState('');
  const [quantidade, setQuantidade] = useState('1');
  const [erros, setErros] = useState({});

  function enviar(e) {
    e.preventDefault();
    const qtd = comoInteiro(1)(quantidade);
    const novos = { modelo: modelo ? null : 'Escolha o modelo da placa', quantidade: qtd.erro ?? null };
    setErros(novos);
    if (novos.modelo || novos.quantidade) return;
    onEnviar({ servico_id: servico.id, placa_modelo_id: Number(modelo), quantidade: qtd.valor });
  }

  return (
    <form className="form orcamento__escolha" onSubmit={enviar} noValidate>
      <SeletorModelo valor={modelo} onMudar={setModelo} erro={erros.modelo} />
      <Campo
        rotulo="Quantidade de placas" nome="quantidade" inputMode="numeric" value={quantidade}
        erros={erros.quantidade ? [{ campo: 'quantidade', mensagem: erros.quantidade }] : []}
        onChange={(e) => setQuantidade(e.target.value)}
      />
      <div className="orcamento__botoes">
        <button className="btn btn--primario" disabled={enviando}>Adicionar placa</button>
        <button type="button" className="btn btn--fantasma" onClick={onCancelar}>Cancelar</button>
      </div>
    </form>
  );
}

function FormPacote({ pacote, servicos, enviando, onCancelar, onEnviar }) {
  const servicoDe = (it) => servicos.find((s) => s.id === it.servico_id);
  const opcionais = pacote.itens.filter((it) => it.opcional);
  // Os opcionais começam desmarcados: o Lucca marca só o que o cliente quiser.
  const [marcados, setMarcados] = useState([]);
  const [modelo, setModelo] = useState('');
  const [erroModelo, setErroModelo] = useState(null);
  const precisaModelo = pacote.itens.some((it) => servicoDe(it)?.tipo === 'placa' && !it.placa_modelo_id && (!it.opcional || marcados.includes(it.id)));

  const marcar = (itemId, marcado) => setMarcados((m) => (marcado ? [...m, itemId] : m.filter((x) => x !== itemId)));

  function enviar(e) {
    e.preventDefault();
    if (precisaModelo && !modelo) return setErroModelo('Escolha o modelo da placa');
    setErroModelo(null);
    return onEnviar({ pacote_id: pacote.id, opcionais: marcados, ...(precisaModelo ? { placa_modelo_id: Number(modelo) } : {}) });
  }

  return (
    <form className="form orcamento__escolha" onSubmit={enviar} noValidate>
      <p>
        <strong>{pacote.nome}</strong>{' '}
        <small className="vazio">{pacote.itens.filter((it) => !it.opcional).map((it) => servicoDe(it)?.nome ?? 'serviço removido').join(', ')}</small>
      </p>
      {opcionais.length > 0 && (
        <fieldset>
          <legend>Opcionais</legend>
          {opcionais.map((it) => (
            <label key={it.id} className="campo--check">
              <input type="checkbox" checked={marcados.includes(it.id)} onChange={(e) => marcar(it.id, e.target.checked)} />
              {servicoDe(it)?.nome ?? 'serviço removido'}
            </label>
          ))}
        </fieldset>
      )}
      {precisaModelo && <SeletorModelo valor={modelo} onMudar={setModelo} erro={erroModelo} />}
      <div className="orcamento__botoes">
        <button className="btn btn--primario" disabled={enviando}>Aplicar pacote</button>
        <button type="button" className="btn btn--fantasma" onClick={onCancelar}>Cancelar</button>
      </div>
    </form>
  );
}

function FormLivre({ enviando, onCancelar, onEnviar }) {
  const [v, setV] = useState({ nome: '', frase: '', unico: '', mensal: '' });
  const [erros, setErros] = useState([]);
  const muda = (k) => ({ value: v[k], onChange: (e) => setV((x) => ({ ...x, [k]: e.target.value })) });

  function enviar(e) {
    e.preventDefault();
    const unico = paraCentavos(v.unico);
    const mensal = paraCentavos(v.mensal);
    const novos = [];
    if (!v.nome.trim()) novos.push({ campo: 'livre_nome', mensagem: 'Informe o nome' });
    if (Number.isNaN(unico)) novos.push({ campo: 'livre_unico', mensagem: 'Valor inválido' });
    if (Number.isNaN(mensal)) novos.push({ campo: 'livre_mensal', mensagem: 'Valor inválido' });
    if (!novos.length && unico == null && mensal == null) novos.push({ campo: 'livre_unico', mensagem: 'Informe o valor único ou o mensal' });
    setErros(novos);
    if (novos.length) return;
    onEnviar({ livre: true, nome: v.nome.trim(), frase: v.frase, valor_unico_centavos: unico, valor_mensal_centavos: mensal });
  }

  return (
    <form className="form orcamento__escolha" onSubmit={enviar} noValidate>
      <Campo rotulo="Nome" nome="livre_nome" erros={erros} {...muda('nome')} />
      <Campo rotulo="Frase" nome="livre_frase" erros={erros} {...muda('frase')} />
      <Campo rotulo="Valor único (R$)" nome="livre_unico" erros={erros} inputMode="decimal" {...muda('unico')} />
      <Campo rotulo="Valor mensal (R$)" nome="livre_mensal" erros={erros} inputMode="decimal" {...muda('mensal')} />
      <div className="orcamento__botoes">
        <button className="btn btn--primario" disabled={enviando}>Adicionar item</button>
        <button type="button" className="btn btn--fantasma" onClick={onCancelar}>Cancelar</button>
      </div>
    </form>
  );
}

function ItemLinha({ item, ocupado, onSalvar, onRemover }) {
  const ocultos = useValoresOcultos();
  const campo = (nome) => ({
    id: `item-${item.id}-${nome}`, original: item[nome], onSalvar: (v) => onSalvar({ [nome]: v }),
  });
  const dinheiro = (nome, rotulo, acessivel) => (ocultos
    ? <ValorOculto key={nome} rotulo={rotulo} centavos={item[nome]} />
    : <CampoAoSair key={`${nome}-${item[nome]}`} {...campo(nome)} rotulo={rotulo} rotuloAcessivel={`${acessivel} de ${item.nome}`} inputMode="decimal" texto={centavosParaTexto(item[nome])} converter={comoDinheiro} />);

  return (
    <li className="orcamento__item">
      <CampoAoSair key={`nome-${item.nome}`} {...campo('nome')} className="orcamento__nome" rotulo="Nome" rotuloAcessivel={`Nome de ${item.nome}`} texto={item.nome} converter={comoObrigatorio('Informe o nome')} />
      {item.tipo_servico === 'placa' && (
        <CampoAoSair key={`quantidade-${item.quantidade}`} {...campo('quantidade')} rotulo="Qtd." rotuloAcessivel={`Quantidade de ${item.nome}`} inputMode="numeric" texto={String(item.quantidade)} converter={comoInteiro(1)} />
      )}
      {dinheiro('valor_unico_centavos', 'Valor único (R$)', 'Valor único')}
      {dinheiro('valor_mensal_centavos', 'Por mês (R$)', 'Valor mensal')}
      <button type="button" className="btn btn--pequeno btn--perigo orcamento__remover" aria-label={`Remover ${item.nome}`} disabled={ocupado} onClick={onRemover}>Remover</button>
      <div className="orcamento__frase">
        <CampoAoSair key={`frase-${item.frase}`} {...campo('frase')} rotulo="Frase" rotuloAcessivel={`Frase de ${item.nome}`} texto={item.frase} />
        {item.valor_mensal_centavos > 0 && (
          <label className="campo--check">
            <input type="checkbox" checked={!!item.primeiro_mes_gratis} disabled={ocupado} onChange={(e) => onSalvar({ primeiro_mes_gratis: e.target.checked })} />
            1º mês grátis (sai riscado no PDF)
          </label>
        )}
      </div>
    </li>
  );
}

function Totais({ orcamento, ocupado, descontoPadrao, onSalvar }) {
  const { totais, desconto_pct: pct } = orcamento;
  const ocultos = useValoresOcultos();
  const valorDesconto = orcamento.desconto_valor_centavos;
  return (
    <section className="cartao orcamento__totais" aria-label="Totais">
      <h2>Totais</h2>
      {totais.desconto_centavos > 0 && (
        <div className="orcamento__linha"><span>Subtotal</span><span>{formatarDinheiro(totais.subtotal_unico_centavos)}</span></div>
      )}
      {totais.desconto_valor_centavos > 0 && (
        <div className="orcamento__linha">
          <span>Desconto</span>
          <span>{`− ${formatarDinheiro(totais.desconto_valor_centavos)}`}</span>
        </div>
      )}
      <div className="orcamento__desconto">
        {ocultos ? <ValorOculto rotulo="Desconto (R$)" centavos={valorDesconto ?? 0} /> : (
          <CampoAoSair
            id="orcamento-desconto-valor" key={`desconto-valor-${valorDesconto}`} rotulo="Desconto (R$)" inputMode="decimal"
            texto={centavosParaTexto(valorDesconto)} original={valorDesconto} converter={comoDinheiro}
            onSalvar={(v) => onSalvar({ desconto_valor_centavos: v })}
          />
        )}
      </div>
      {pct != null ? (
        <>
          {totais.desconto_combo_centavos > 0 && (
            <div className="orcamento__linha">
              <span>{`Desconto combo (${pct}%)`}</span>
              <span>{`− ${formatarDinheiro(totais.desconto_combo_centavos)}`}</span>
            </div>
          )}
          <div className="orcamento__desconto">
            <CampoAoSair
              id="orcamento-desconto" key={`desconto-${pct}`} rotulo="Desconto (%)" inputMode="numeric" texto={String(pct)}
              original={pct} converter={comoInteiro(0, 100)} onSalvar={(v) => onSalvar({ desconto_pct: v })}
            />
            <button type="button" className="btn btn--pequeno" disabled={ocupado} onClick={() => onSalvar({ desconto_pct: null })}>Tirar desconto</button>
          </div>
          {totais.desconto_combo_centavos === 0 && <p className="vazio">O desconto de combo entra com 2 ou mais serviços pagos uma vez.</p>}
        </>
      ) : (
        <div className="orcamento__desconto">
          <button type="button" className="btn btn--pequeno" disabled={ocupado} onClick={() => onSalvar({ desconto_pct: descontoPadrao })}>Aplicar desconto de combo</button>
        </div>
      )}
      <div className="orcamento__linha orcamento__linha--total">
        <span>Total pago uma vez</span>
        <span className="orcamento__total-final">
          {totais.desconto_centavos > 0 && <s aria-label={`Sem desconto: ${formatarDinheiro(totais.subtotal_unico_centavos)}`}>{formatarDinheiro(totais.subtotal_unico_centavos)}</s>}
          <strong>{formatarDinheiro(totais.total_unico_centavos)}</strong>
        </span>
      </div>
      {totais.mensalidades.map((m, i) => (
        <div key={`${m.nome}-${i}`} className="orcamento__linha"><span>{m.nome}</span><span>{`${formatarDinheiro(m.valor_centavos)}/mês`}</span></div>
      ))}
      <div className="orcamento__linha orcamento__linha--total">
        <span>Total por mês</span><strong>{`${formatarDinheiro(totais.total_mensal_centavos)}/mês`}</strong>
      </div>
    </section>
  );
}
