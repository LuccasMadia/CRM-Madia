import { useState } from 'react';
import { api } from '../../api/client.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { Modal } from '../../components/Modal.jsx';
import { Aviso } from '../../components/Aviso.jsx';
import { Campo } from '../../components/Campo.jsx';
import { formatarDinheiro } from '../../lib/dinheiro.js';
import { formatarData, hojeISO } from '../../lib/datas.js';
import { ROTULO_ETAPA } from '../../lib/rotulos.js';
import { CaixaModeloTarefas, modeloPadrao, useModelosTarefas } from '../../components/tarefas/ModeloTarefas.jsx';
import {
  destinosDoItem, destinoPadrao, valoresComDesconto, planejarParcelas, sugerirParcelas, SERVICO_DO_DESTINO, etapaAoVincular,
} from '../../../../server/domain/orcamentos.js';

const ROTULO_DESTINO = {
  site: 'Site/Sistema',
  gmn: 'Google Meu Negócio',
  placa: 'Venda de placa',
  mensal_site: 'Mensalidade do site',
  mensal_gmn: 'Mensalidade do Google Meu Negócio',
};

const ROTULO_PARCELAS = {
  nenhuma: 'Sem parcelas',
  avista: 'À vista',
  entrada_entrega: '50% entrada + 50% na entrega',
  mensais: 'Parcelas mensais',
};

const num = (v) => Number(v) || 0;
const plural = (n, um, varios) => (n === 1 ? um : varios);

// GMN não tem funil: andamento é "pendente" e entregue é "configurado".
export function rotuloEtapaProjeto(projeto, etapa = projeto.etapa) {
  if (projeto.servico === 'google_meu_negocio' && etapa === 'andamento') return 'Pendente';
  if (projeto.servico === 'google_meu_negocio' && etapa === 'entregue') return 'Configurado';
  return ROTULO_ETAPA[etapa];
}

// Serviço do projeto que o item vira (site ou GMN); null quando o item não vira projeto.
const servicoDoItem = (it) => SERVICO_DO_DESTINO[destinosDoItem(it)[0]] ?? null;

// Projeto aberto (não entregue) do mesmo serviço que o aceite sugere usar: só quando há exatamente um.
export function projetoSugerido(orcamento, servico) {
  const abertos = (orcamento.projetos_vinculaveis ?? []).filter((p) => p.servico === servico && p.etapa !== 'entregue');
  return abertos.length === 1 ? abertos[0] : null;
}

// Para o aviso na tela do orçamento: os projetos que o aceite vai sugerir usar, um por serviço do orçamento.
export function sugestoesDeVinculo(orcamento) {
  const servicos = new Set(orcamento.itens.filter((it) => destinoPadrao(it) !== 'nenhum').map(servicoDoItem).filter(Boolean));
  return [...servicos].map((s) => projetoSugerido(orcamento, s)).filter(Boolean);
}

// O que cada item vira começa pelo padrão (tudo marcado); as parcelas seguem a forma de pagamento escrita.
// Havendo um só projeto aberto do mesmo serviço, já vem escolhido para ser usado (e, se ele já tem
// parcelas, o atalho começa em "Sem parcelas" para não cobrar duas vezes).
function escolhasIniciais(orcamento) {
  const sugestao = sugerirParcelas(orcamento.pagamento);
  const hoje = hojeISO();
  const usados = new Set();
  return Object.fromEntries(orcamento.itens.map((it) => {
    const padrao = destinoPadrao(it);
    const servico = servicoDoItem(it);
    const sugerido = servico && padrao !== 'nenhum' ? projetoSugerido(orcamento, servico) : null;
    const vinculo = sugerido && !usados.has(sugerido.id) ? sugerido : null;
    if (vinculo) usados.add(vinculo.id);
    return [it.id, {
      marcado: padrao !== 'nenhum',
      destino: padrao !== 'nenhum' ? padrao : destinosDoItem(it)[0],
      alvo: '',
      vinculo: vinculo ? String(vinculo.id) : '',
      substituir: false,
      parcelas: { modo: vinculo?.parcelas.length ? 'nenhuma' : sugestao.modo, quantidade: String(sugestao.quantidade), primeira: hoje },
      dia: String(Number(hoje.slice(8, 10))),
    }];
  }));
}

// A conferência que aparece ao marcar o orçamento como aceito: lista o que vai ser criado, um bloco por item.
export function ConferenciaAceite({ orcamento, onFechar, onAceito }) {
  const [escolhas, setEscolhas] = useState(() => escolhasIniciais(orcamento));
  const { erro, erros, enviando, executar, setErros } = useEnvio();
  const valores = valoresComDesconto(orcamento.itens, orcamento.totais.desconto_centavos);
  const vinculaveis = orcamento.projetos_vinculaveis ?? [];
  const mudar = (id, parcial) => setEscolhas((atual) => ({ ...atual, [id]: { ...atual[id], ...parcial } }));
  const destinoDe = (it) => (escolhas[it.id].marcado ? escolhas[it.id].destino : 'nenhum');
  // Tarefas do modelo do serviço: marcado por padrão no projeto novo, desmarcado no vinculado (que já tem as dele).
  const modelos = useModelosTarefas();
  const modeloDo = (it) => modeloPadrao(modelos, SERVICO_DO_DESTINO[destinoDe(it)]);
  const criaTarefas = (it) => escolhas[it.id].tarefas ?? !vinculadoDe(it);
  const sites = orcamento.itens.filter((it) => destinoDe(it) === 'site');
  const gmns = orcamento.itens.filter((it) => destinoDe(it) === 'gmn');

  // Projeto existente que o item vai usar; null quando cria um novo.
  function vinculadoDe(it) {
    if (!['site', 'gmn'].includes(destinoDe(it)) || !escolhas[it.id].vinculo) return null;
    return vinculaveis.find((p) => String(p.id) === escolhas[it.id].vinculo) ?? null;
  }
  const nomeDoProjeto = (it) => vinculadoDe(it)?.titulo ?? it.nome;

  function escolherVinculo(it, valor) {
    const projeto = vinculaveis.find((p) => String(p.id) === valor);
    const { modo } = sugerirParcelas(orcamento.pagamento);
    mudar(it.id, { vinculo: valor, tarefas: null, parcelas: { ...escolhas[it.id].parcelas, modo: projeto?.parcelas.length ? 'nenhuma' : modo } });
  }
  // Projetos já escolhidos por outro item: não dá para usar o mesmo em dois.
  const ocupadosPorOutros = (it) => new Set(orcamento.itens.filter((o) => o.id !== it.id).map(vinculadoDe).filter(Boolean).map((p) => p.id));

  // Projeto que recebe a mensalidade do item; null quando não há onde pôr (só acontece com site).
  function alvoDe(it) {
    const destino = destinoDe(it);
    if (destino === 'mensal_site') return sites.find((s) => String(s.id) === escolhas[it.id].alvo) ?? sites[0] ?? null;
    if (destino === 'mensal_gmn') return gmns[0] ?? null;
    return null;
  }
  const semSite = (it) => destinoDe(it) === 'mensal_site' && !sites.length;
  const criaAlgo = (it) => destinoDe(it) !== 'nenhum' && !semSite(it);
  const temMensalidade = (it) => destinoDe(it).startsWith('mensal') || (destinoDe(it) === 'site' && num(it.valor_mensal_centavos) > 0);
  // Projeto existente que receberia a mensalidade do item (o próprio vinculado, ou o do item alvo).
  function existenteDaMensalidade(it) {
    if (destinoDe(it) === 'site') return vinculadoDe(it);
    const alvo = alvoDe(it);
    return alvo ? vinculadoDe(alvo) : null;
  }
  // O projeto vinculado já cobra mensalidade e o Lucca não pediu para substituir: a do orçamento não entra.
  const mantemMensalidade = (it) => !!existenteDaMensalidade(it)?.mensalidade_ativa && !escolhas[it.id].substituir;
  // Ao substituir, o dia começa pelo que o projeto já usa.
  function substituirMensalidade(it, substituir) {
    const diaAtual = existenteDaMensalidade(it)?.mensalidade_dia_vencimento;
    mudar(it.id, { substituir, ...(substituir && diaAtual ? { dia: String(diaAtual) } : {}) });
  }

  const criadoUnico = orcamento.itens.filter((it) => ['site', 'gmn', 'placa'].includes(destinoDe(it)))
    .reduce((s, it) => s + (valores[it.id] ?? 0), 0);
  const criadoMensal = orcamento.itens
    .filter((it) => criaAlgo(it) && temMensalidade(it) && !mantemMensalidade(it))
    .reduce((s, it) => s + num(it.valor_mensal_centavos), 0);

  function enviar(e) {
    e.preventDefault();
    const problemas = [];
    const corpo = orcamento.itens.map((it) => {
      const escolha = escolhas[it.id];
      const destino = criaAlgo(it) ? destinoDe(it) : 'nenhum';
      const saida = { item_id: it.id, destino };
      if (destino === 'site' || destino === 'gmn') {
        const { modo, quantidade, primeira } = escolha.parcelas;
        const n = Number(quantidade);
        if (modo === 'mensais' && !(Number.isInteger(n) && n >= 1 && n <= 60)) problemas.push({ campo: `quantidade-${it.id}`, mensagem: 'De 1 a 60 parcelas' });
        if (modo !== 'nenhuma' && !primeira) problemas.push({ campo: `primeira-${it.id}`, mensagem: 'Informe a data' });
        saida.parcelas = { modo, ...(modo === 'mensais' ? { quantidade: n } : {}), ...(modo !== 'nenhuma' ? { primeira } : {}) };
        const vinculado = vinculadoDe(it);
        if (vinculado) saida.projeto_id = vinculado.id;
        if (modeloDo(it) && criaTarefas(it)) saida.modelo_tarefas_id = modeloDo(it).id;
      }
      if (temMensalidade(it) && destino !== 'nenhum') {
        const dia = Number(escolha.dia);
        if (!(Number.isInteger(dia) && dia >= 1 && dia <= 31)) problemas.push({ campo: `dia-${it.id}`, mensagem: 'Dia de 1 a 31' });
        saida.dia_vencimento = dia;
        if (existenteDaMensalidade(it)?.mensalidade_ativa && escolha.substituir) saida.substituir_mensalidade = true;
      }
      const alvo = alvoDe(it);
      if (alvo) saida.alvo_item_id = alvo.id;
      return saida;
    });
    setErros(problemas);
    if (problemas.length) return;
    executar(async () => {
      onAceito(await api(`/orcamentos/${orcamento.id}/aceitar`, { method: 'POST', body: { escolhas: corpo } }));
    });
  }

  // Mensalidade do item, que pode cair num projeto vinculado que já cobra uma.
  const mensalidadeDo = (it, texto) => (
    <Mensalidade
      id={it.id} item={it} dia={escolhas[it.id].dia} erros={erros} onDia={(dia) => mudar(it.id, { dia })} texto={texto}
      existente={existenteDaMensalidade(it)} substituir={escolhas[it.id].substituir} onSubstituir={(substituir) => substituirMensalidade(it, substituir)}
    />
  );

  return (
    <Modal titulo={`Aceitar o orçamento nº ${String(orcamento.numero).padStart(3, '0')}`} onFechar={onFechar}>
      <form className="conferencia" onSubmit={enviar} noValidate>
        <p className="vazio">Confira o que será criado para {orcamento.cliente_nome || 'o cliente'}. Desmarque o que não quiser criar.</p>
        <ul className="conferencia__itens">
          {orcamento.itens.map((it) => {
            const escolha = escolhas[it.id];
            const destino = destinoDe(it);
            const opcoes = destinosDoItem(it).filter((d) => d !== 'nenhum');
            const vinculado = vinculadoDe(it);
            const candidatos = vinculaveis.filter((p) => p.servico === SERVICO_DO_DESTINO[destino]);
            const parcelas = (
              <Parcelas id={it.id} valor={valores[it.id] ?? 0} escolha={escolha.parcelas} erros={erros} onMudar={(p) => mudar(it.id, { parcelas: { ...escolha.parcelas, ...p } })} />
            );
            return (
              <li key={it.id} className={`conferencia__item${escolha.marcado ? '' : ' conferencia__item--desmarcado'}`}>
                <div className="conferencia__cabeca">
                  <label className="campo--check">
                    <input type="checkbox" checked={escolha.marcado} onChange={(e) => mudar(it.id, { marcado: e.target.checked })} />
                    <strong>{it.quantidade > 1 ? `${it.nome} × ${it.quantidade}` : it.nome}</strong>
                  </label>
                  <ValorItem item={it} valor={valores[it.id]} />
                </div>
                {!escolha.marcado && <p className="conferencia__nada">Não será criado.</p>}
                {escolha.marcado && (
                  <div className="conferencia__corpo">
                    {opcoes.length > 1 && (
                      <Campo rotulo="Vira" nome={`destino-${it.id}`}>
                        <select value={escolha.destino} onChange={(e) => mudar(it.id, { destino: e.target.value })}>
                          {opcoes.map((d) => <option key={d} value={d}>{ROTULO_DESTINO[d]}</option>)}
                        </select>
                      </Campo>
                    )}
                    {(destino === 'site' || destino === 'gmn') && candidatos.length > 0 && (
                      <EscolhaProjeto
                        id={it.id} candidatos={candidatos} valor={escolha.vinculo} ocupados={ocupadosPorOutros(it)}
                        sugerido={projetoSugerido(orcamento, SERVICO_DO_DESTINO[destino])} onEscolher={(v) => escolherVinculo(it, v)}
                      />
                    )}
                    {vinculado && <PreviaVinculo projeto={vinculado} destino={destino} valor={valores[it.id] ?? 0} />}
                    {destino === 'site' && (
                      <>
                        {!vinculado && <p className="conferencia__vira">Vira um projeto em Sites, na etapa <strong>Valor definido</strong>.</p>}
                        {parcelas}
                        {num(it.valor_mensal_centavos) > 0 && mensalidadeDo(it, 'Mensalidade neste projeto, começa a cobrar quando o site for entregue.')}
                        <CaixaModeloTarefas modelo={modeloDo(it)} marcado={criaTarefas(it)} onMudar={(tarefas) => mudar(it.id, { tarefas })} />
                      </>
                    )}
                    {destino === 'gmn' && (
                      <>
                        {!vinculado && <p className="conferencia__vira">Vira o Google Meu Negócio do cliente, como <strong>pendente</strong>.</p>}
                        {parcelas}
                        <CaixaModeloTarefas modelo={modeloDo(it)} marcado={criaTarefas(it)} onMudar={(tarefas) => mudar(it.id, { tarefas })} />
                      </>
                    )}
                    {destino === 'placa' && (
                      <p className="conferencia__vira">
                        {`Venda de ${it.quantidade} ${plural(it.quantidade, 'placa', 'placas')} a ${formatarDinheiro(Math.round((valores[it.id] ?? 0) / it.quantidade))} cada, a receber, em Placas › Vendas.`}
                      </p>
                    )}
                    {destino === 'mensal_site' && (semSite(it)
                      ? <p className="aviso conferencia__aviso">Nenhum site será criado neste aceite, então esta mensalidade não será criada. Ligue-a depois no projeto do site.</p>
                      : (
                        <>
                          {sites.length > 1 && (
                            <Campo rotulo="Em qual site" nome={`alvo-${it.id}`}>
                              <select value={String(alvoDe(it).id)} onChange={(e) => mudar(it.id, { alvo: e.target.value })}>
                                {sites.map((s) => <option key={s.id} value={s.id}>{nomeDoProjeto(s)}</option>)}
                              </select>
                            </Campo>
                          )}
                          {mensalidadeDo(it, `${sites.length > 1 ? 'Mensalidade no site escolhido' : `Mensalidade em "${nomeDoProjeto(sites[0])}"`}, começa a cobrar quando o site for entregue.`)}
                        </>
                      ))}
                    {destino === 'mensal_gmn' && mensalidadeDo(it,
                      gmns.length ? 'Mensalidade no Google Meu Negócio acima, começa a cobrar hoje.' : 'Cria um Google Meu Negócio só para esta mensalidade, que começa a cobrar hoje.')}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <div className="conferencia__total" aria-label="Total que será criado">
          <span>Vai criar</span>
          <strong>{`${formatarDinheiro(criadoUnico)} pagos uma vez${criadoMensal ? ` + ${formatarDinheiro(criadoMensal)}/mês` : ''}`}</strong>
        </div>
        {criadoUnico !== orcamento.totais.total_unico_centavos && (
          <p className="vazio">{`O orçamento soma ${formatarDinheiro(orcamento.totais.total_unico_centavos)} pagos uma vez: o que ficou desmarcado não entra.`}</p>
        )}
        <Aviso erro={erros.length ? null : erro} />
        {erros.length > 0 && <p className="aviso aviso--erro" role="alert">Confira os campos destacados.</p>}
        <div className="orcamento__botoes">
          <button className="btn btn--primario" disabled={enviando}>Aceitar e criar</button>
          <button type="button" className="btn btn--fantasma" onClick={onFechar} disabled={enviando}>Cancelar</button>
        </div>
      </form>
    </Modal>
  );
}

function ValorItem({ item, valor }) {
  const unico = num(item.valor_unico_centavos);
  const mensal = num(item.valor_mensal_centavos);
  return (
    <span className="conferencia__valor">
      {unico > 0 && <span>{formatarDinheiro(valor)}</span>}
      {unico > 0 && valor !== unico && <small className="vazio">{`de ${formatarDinheiro(unico)}, com o desconto`}</small>}
      {mensal > 0 && <span>{`${formatarDinheiro(mensal)}/mês`}</span>}
    </span>
  );
}

// Criar um projeto novo ou usar um que o cliente já tem (do mesmo serviço).
function EscolhaProjeto({ id, candidatos, valor, ocupados, sugerido, onEscolher }) {
  return (
    <>
      {sugerido && (
        <p className="conferencia__vira">{`Já existe "${sugerido.titulo}" em ${rotuloEtapaProjeto(sugerido)} — usar esse?`}</p>
      )}
      <Campo rotulo="Projeto" nome={`vinculo-${id}`}>
        <select value={valor} onChange={(e) => onEscolher(e.target.value)}>
          <option value="">Criar projeto novo</option>
          {candidatos.map((p) => (
            <option key={p.id} value={String(p.id)} disabled={ocupados.has(p.id)}>
              {`Usar projeto existente: ${p.titulo} (${rotuloEtapaProjeto(p)})`}
            </option>
          ))}
        </select>
      </Campo>
    </>
  );
}

// O que muda no projeto existente: etapa (só avança), valor e as parcelas que ele já tem.
function PreviaVinculo({ projeto, destino, valor }) {
  const nova = etapaAoVincular(projeto.etapa, destino);
  const etapa = nova === projeto.etapa
    ? `continua ${projeto.servico === 'google_meu_negocio' ? '' : 'em '}${rotuloEtapaProjeto(projeto)}`
    : `${rotuloEtapaProjeto(projeto)} → ${rotuloEtapaProjeto(projeto, nova)}`;
  const pagas = projeto.parcelas.filter((p) => p.pago_em).length;
  return (
    <div className="conferencia__previa" aria-label="O que muda no projeto">
      <p className="conferencia__vira">
        Atualiza <strong>{projeto.titulo}</strong>: título, tarefas, notas e o resto continuam como estão.
      </p>
      <ul className="conferencia__mudancas">
        <li>{`Etapa: ${etapa}`}</li>
        <li>{valor !== projeto.valor_total_centavos
          ? `Valor: de ${formatarDinheiro(projeto.valor_total_centavos)} para ${formatarDinheiro(valor)}`
          : `Valor: continua ${formatarDinheiro(valor)}`}
        </li>
        {projeto.parcelas.length > 0 && (
          <li>
            {`Já tem ${projeto.parcelas.length} ${plural(projeto.parcelas.length, 'parcela', 'parcelas')}`}
            {pagas > 0 && ` (${pagas} ${plural(pagas, 'paga', 'pagas')})`}
            {', que ficam como estão: '}
            {projeto.parcelas.map((p) => `${formatarData(p.vencimento)}: ${formatarDinheiro(p.valor_centavos)}${p.pago_em ? ' paga' : ''}`).join(' · ')}
            . As parcelas escolhidas abaixo entram além delas.
          </li>
        )}
      </ul>
    </div>
  );
}

function Parcelas({ id, valor, escolha, erros, onMudar }) {
  const n = Number(escolha.quantidade);
  const plano = escolha.modo === 'mensais' && !(Number.isInteger(n) && n >= 1 && n <= 60)
    ? []
    : planejarParcelas(valor, { modo: escolha.modo, quantidade: n, primeira: escolha.primeira || hojeISO() });
  return (
    <div className="conferencia__parcelas">
      <div className="conferencia__campos">
        <Campo rotulo="Parcelas" nome={`modo-${id}`}>
          <select value={escolha.modo} onChange={(e) => onMudar({ modo: e.target.value })}>
            {Object.entries(ROTULO_PARCELAS).map(([modo, rotulo]) => <option key={modo} value={modo}>{rotulo}</option>)}
          </select>
        </Campo>
        {escolha.modo === 'mensais' && (
          <Campo rotulo="Quantas" nome={`quantidade-${id}`} erros={erros} inputMode="numeric" value={escolha.quantidade}
            onChange={(e) => onMudar({ quantidade: e.target.value })} />
        )}
        {escolha.modo !== 'nenhuma' && (
          <Campo rotulo={escolha.modo === 'avista' ? 'Vencimento' : '1ª parcela em'} nome={`primeira-${id}`} erros={erros} type="date"
            value={escolha.primeira} onChange={(e) => onMudar({ primeira: e.target.value })} />
        )}
      </div>
      {plano.length > 0 && (
        <p className="conferencia__plano">
          {plano.map((p) => `${formatarData(p.vencimento)}: ${formatarDinheiro(p.valor_centavos)}`).join(' · ')}
        </p>
      )}
      {escolha.modo === 'entrada_entrega' && <p className="vazio conferencia__plano">A data da entrega é um palpite: ajuste no projeto quando souber.</p>}
    </div>
  );
}

// Projeto vinculado que já cobra mensalidade: por padrão fica a atual; dá para trocar pela do orçamento.
function Mensalidade({ id, item, dia, erros, onDia, texto, existente, substituir, onSubstituir }) {
  const valor = formatarDinheiro(num(item.valor_mensal_centavos));
  const jaCobra = !!existente?.mensalidade_ativa;
  return (
    <div className="conferencia__mensal">
      {jaCobra ? (
        <>
          <p className="conferencia__vira">
            {`"${existente.titulo}" já cobra ${formatarDinheiro(existente.mensalidade_valor_centavos)}/mês: fica a atual.`}
          </p>
          <label className="campo--check">
            <input type="checkbox" checked={substituir} onChange={(e) => onSubstituir(e.target.checked)} />
            {`Substituir pelo valor do orçamento (${valor}/mês)`}
          </label>
        </>
      ) : <p className="conferencia__vira">{texto}</p>}
      {(!jaCobra || substituir) && (
        <div className="conferencia__campos">
          <Campo rotulo={`Dia do vencimento (${valor}/mês)`} nome={`dia-${id}`} erros={erros}
            type="number" min="1" max="31" value={dia} onChange={(e) => onDia(e.target.value)} />
        </div>
      )}
    </div>
  );
}
