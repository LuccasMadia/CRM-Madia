import { useState } from 'react';
import { api } from '../../api/client.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { Modal } from '../../components/Modal.jsx';
import { Aviso } from '../../components/Aviso.jsx';
import { Campo } from '../../components/Campo.jsx';
import { formatarDinheiro } from '../../lib/dinheiro.js';
import { formatarData, hojeISO } from '../../lib/datas.js';
import {
  destinosDoItem, destinoPadrao, valoresComDesconto, planejarParcelas, sugerirParcelas,
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

// O que cada item vira começa pelo padrão (tudo marcado); as parcelas seguem a forma de pagamento escrita.
function escolhasIniciais(orcamento) {
  const sugestao = sugerirParcelas(orcamento.pagamento);
  const hoje = hojeISO();
  return Object.fromEntries(orcamento.itens.map((it) => {
    const padrao = destinoPadrao(it);
    return [it.id, {
      marcado: padrao !== 'nenhum',
      destino: padrao !== 'nenhum' ? padrao : destinosDoItem(it)[0],
      alvo: '',
      parcelas: { modo: sugestao.modo, quantidade: String(sugestao.quantidade), primeira: hoje },
      dia: String(Number(hoje.slice(8, 10))),
    }];
  }));
}

// A conferência que aparece ao marcar o orçamento como aceito: lista o que vai ser criado, um bloco por item.
export function ConferenciaAceite({ orcamento, onFechar, onAceito }) {
  const [escolhas, setEscolhas] = useState(() => escolhasIniciais(orcamento));
  const { erro, erros, enviando, executar, setErros } = useEnvio();
  const valores = valoresComDesconto(orcamento.itens, orcamento.totais.desconto_centavos);
  const mudar = (id, parcial) => setEscolhas((atual) => ({ ...atual, [id]: { ...atual[id], ...parcial } }));
  const destinoDe = (it) => (escolhas[it.id].marcado ? escolhas[it.id].destino : 'nenhum');
  const sites = orcamento.itens.filter((it) => destinoDe(it) === 'site');
  const gmns = orcamento.itens.filter((it) => destinoDe(it) === 'gmn');

  // Projeto que recebe a mensalidade do item; null quando não há onde pôr (só acontece com site).
  function alvoDe(it) {
    const destino = destinoDe(it);
    if (destino === 'mensal_site') return sites.find((s) => String(s.id) === escolhas[it.id].alvo) ?? sites[0] ?? null;
    if (destino === 'mensal_gmn') return gmns[0] ?? null;
    return null;
  }
  const semSite = (it) => destinoDe(it) === 'mensal_site' && !sites.length;
  const criaAlgo = (it) => destinoDe(it) !== 'nenhum' && !semSite(it);

  const criadoUnico = orcamento.itens.filter((it) => ['site', 'gmn', 'placa'].includes(destinoDe(it)))
    .reduce((s, it) => s + (valores[it.id] ?? 0), 0);
  const criadoMensal = orcamento.itens
    .filter((it) => criaAlgo(it) && (destinoDe(it).startsWith('mensal') || destinoDe(it) === 'site'))
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
      }
      const temMensal = destino.startsWith('mensal') || (destino === 'site' && num(it.valor_mensal_centavos) > 0);
      if (temMensal) {
        const dia = Number(escolha.dia);
        if (!(Number.isInteger(dia) && dia >= 1 && dia <= 31)) problemas.push({ campo: `dia-${it.id}`, mensagem: 'Dia de 1 a 31' });
        saida.dia_vencimento = dia;
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

  return (
    <Modal titulo={`Aceitar o orçamento nº ${String(orcamento.numero).padStart(3, '0')}`} onFechar={onFechar}>
      <form className="conferencia" onSubmit={enviar} noValidate>
        <p className="vazio">Confira o que será criado para {orcamento.cliente_nome || 'o cliente'}. Desmarque o que não quiser criar.</p>
        <ul className="conferencia__itens">
          {orcamento.itens.map((it) => {
            const escolha = escolhas[it.id];
            const destino = destinoDe(it);
            const opcoes = destinosDoItem(it).filter((d) => d !== 'nenhum');
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
                    {destino === 'site' && (
                      <>
                        <p className="conferencia__vira">Vira um projeto em Sites, na etapa <strong>Valor definido</strong>.</p>
                        <Parcelas id={it.id} valor={valores[it.id] ?? 0} escolha={escolha.parcelas} erros={erros} onMudar={(p) => mudar(it.id, { parcelas: { ...escolha.parcelas, ...p } })} />
                        {num(it.valor_mensal_centavos) > 0 && (
                          <Mensalidade id={it.id} item={it} dia={escolha.dia} erros={erros} onDia={(dia) => mudar(it.id, { dia })} texto="Mensalidade neste projeto, começa a cobrar quando o site for entregue." />
                        )}
                      </>
                    )}
                    {destino === 'gmn' && (
                      <>
                        <p className="conferencia__vira">Vira o Google Meu Negócio do cliente, como <strong>pendente</strong>.</p>
                        <Parcelas id={it.id} valor={valores[it.id] ?? 0} escolha={escolha.parcelas} erros={erros} onMudar={(p) => mudar(it.id, { parcelas: { ...escolha.parcelas, ...p } })} />
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
                                {sites.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                              </select>
                            </Campo>
                          )}
                          <Mensalidade id={it.id} item={it} dia={escolha.dia} erros={erros} onDia={(dia) => mudar(it.id, { dia })}
                            texto={`${sites.length > 1 ? 'Mensalidade no site escolhido' : `Mensalidade em "${sites[0].nome}"`}, começa a cobrar quando o site for entregue.`} />
                        </>
                      ))}
                    {destino === 'mensal_gmn' && (
                      <Mensalidade id={it.id} item={it} dia={escolha.dia} erros={erros} onDia={(dia) => mudar(it.id, { dia })}
                        texto={gmns.length ? 'Mensalidade no Google Meu Negócio acima, começa a cobrar hoje.' : 'Cria um Google Meu Negócio só para esta mensalidade, que começa a cobrar hoje.'} />
                    )}
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

function Mensalidade({ id, item, dia, erros, onDia, texto }) {
  return (
    <div className="conferencia__mensal">
      <p className="conferencia__vira">{texto}</p>
      <div className="conferencia__campos">
        <Campo rotulo={`Dia do vencimento (${formatarDinheiro(num(item.valor_mensal_centavos))}/mês)`} nome={`dia-${id}`} erros={erros}
          type="number" min="1" max="31" value={dia} onChange={(e) => onDia(e.target.value)} />
      </div>
    </div>
  );
}
