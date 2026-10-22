import { useState } from 'react';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useFormulario } from '../../hooks/useFormulario.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { Aviso } from '../../components/Aviso.jsx';
import { Campo } from '../../components/Campo.jsx';
import { Modal } from '../../components/Modal.jsx';
import { Confirmacao } from '../../components/Confirmacao.jsx';
import { Numero } from '../../components/Numero.jsx';
import { FormFerramenta } from '../../components/FormFerramenta.jsx';
import { formatarDinheiro, paraCentavos } from '../../lib/dinheiro.js';
import { formatarData, hojeISO, nomeMes } from '../../lib/datas.js';
import { notificar } from '../../lib/notificacoes.js';

const descreverCobranca = (f) => (f.cobranca === 'creditos'
  ? 'Créditos'
  : `Mensalidade${f.dia_cobranca ? ` · dia ${f.dia_cobranca}` : ''}`);

export function Ferramentas() {
  const [mes, setMes] = useState(hojeISO().slice(0, 7));
  const { dados, erro, recarregar } = useCarregar(() => api(`/ferramentas?mes=${mes}`), [mes]);
  // { tipo: 'nova' | 'editar' | 'excluir' | 'cancelar' | 'recargas', ferramenta? }
  const [aberto, setAberto] = useState(null);
  const fechar = () => setAberto(null);
  const [erroReativar, setErroReativar] = useState(null);

  async function reativar(f) {
    setErroReativar(null);
    try {
      await api(`/ferramentas/${f.id}/reativar`, { method: 'POST' });
      recarregar();
    } catch (e) {
      setErroReativar(e);
    }
  }

  async function salvar(corpo) {
    if (aberto.tipo === 'nova') await api('/ferramentas', { method: 'POST', body: corpo });
    else await api(`/ferramentas/${aberto.ferramenta.id}`, { method: 'PUT', body: corpo });
    fechar();
    recarregar();
    notificar('Ferramenta salva');
  }

  return (
    <section>
      <div className="barra-visao barra-ferramentas">
        <label className="campo">
          <span>Mês</span>
          <input type="month" aria-label="Mês" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} />
        </label>
        <button type="button" className="btn btn--primario barra-visao__acao" onClick={() => setAberto({ tipo: 'nova' })}>+ Ferramenta</button>
      </div>
      <Aviso erro={erro ?? erroReativar} />

      {dados && <ResumoFerramentas dados={dados} />}

      {dados && (
        <section className="cartao">
          <h2>Ferramentas</h2>
          {dados.ferramentas.length ? (
            <table className="tabela tabela--ferramentas">
              <thead>
                <tr><th>Ferramenta</th><th>Cobrança</th><th className="num">Valor</th><th className="num">No mês</th><th /></tr>
              </thead>
              <tbody>
                {dados.ferramentas.map((f) => (
                  <tr key={f.id} className={f.cancelada_em ? 'tabela__linha--inativa' : undefined}>
                    <td>
                      <span className="tabela__titulo">
                        {f.nome} {f.cancelada_em && <span className="etiqueta">Cancelada em {formatarData(f.cancelada_em)}</span>}
                      </span>
                      {f.observacao && <span className="tabela__sub">{f.observacao}</span>}
                    </td>
                    <td>{descreverCobranca(f)}</td>
                    <td className="num">
                      {f.cobranca === 'mensalidade'
                        ? formatarDinheiro(f.valor_centavos)
                        : <span className="form__ajuda">{f.ultima_recarga ? `Última recarga ${formatarData(f.ultima_recarga)}` : 'Sem recargas'}</span>}
                    </td>
                    <td className="num tabela__dinheiro">{formatarDinheiro(f.gasto_mes_centavos)}</td>
                    <td className="tabela__acoes">
                      <div className="acoes-linha">
                        {f.cobranca === 'creditos' && (
                          <button type="button" className="btn btn--pequeno" aria-label={`Recargas de ${f.nome}`} onClick={() => setAberto({ tipo: 'recargas', ferramenta: f })}>Recargas</button>
                        )}
                        {f.cobranca === 'mensalidade' && (f.cancelada_em
                          ? <button type="button" className="btn btn--pequeno" aria-label={`Reativar ${f.nome}`} onClick={() => reativar(f)}>Reativar</button>
                          : <button type="button" className="btn btn--fantasma btn--pequeno" aria-label={`Cancelar assinatura de ${f.nome}`} onClick={() => setAberto({ tipo: 'cancelar', ferramenta: f })}>Cancelar assinatura</button>)}
                        <button type="button" className="btn btn--fantasma btn--pequeno" aria-label={`Editar ${f.nome}`} onClick={() => setAberto({ tipo: 'editar', ferramenta: f })}>Editar</button>
                        <button type="button" className="btn btn--fantasma btn--pequeno btn--perigo-suave" aria-label={`Excluir ${f.nome}`} onClick={() => setAberto({ tipo: 'excluir', ferramenta: f })}>Excluir</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="vazio">Nenhuma ferramenta cadastrada.</p>}
        </section>
      )}

      {(aberto?.tipo === 'nova' || aberto?.tipo === 'editar') && (
        <Modal titulo={aberto.tipo === 'nova' ? 'Nova ferramenta' : `Editar ${aberto.ferramenta.nome}`} onFechar={fechar}>
          <FormFerramenta inicial={aberto.ferramenta} onSalvar={salvar} />
        </Modal>
      )}
      {aberto?.tipo === 'excluir' && (
        <Confirmacao
          titulo={`Excluir ${aberto.ferramenta.nome}?`}
          mensagem={aberto.ferramenta.cobranca === 'mensalidade'
            ? 'Some da lista e dos totais de todos os meses. Se só parou de pagar, use “Cancelar assinatura”.'
            : 'Some da lista junto com todas as recargas.'}
          rotuloConfirmar="Excluir"
          onConfirmar={async () => { await api(`/ferramentas/${aberto.ferramenta.id}`, { method: 'DELETE' }); recarregar(); }}
          onFechar={fechar}
        />
      )}
      {aberto?.tipo === 'cancelar' && (
        <Confirmacao
          titulo={`Cancelar assinatura de ${aberto.ferramenta.nome}?`}
          mensagem="Conta neste mês e para de contar a partir do mês que vem. O histórico continua."
          rotuloConfirmar="Cancelar assinatura"
          rotuloVoltar="Voltar"
          onConfirmar={async () => { await api(`/ferramentas/${aberto.ferramenta.id}/cancelar`, { method: 'POST', body: {} }); recarregar(); }}
          onFechar={fechar}
        />
      )}
      {aberto?.tipo === 'recargas' && (
        <Recargas ferramenta={aberto.ferramenta} onMudou={recarregar} onFechar={fechar} />
      )}
    </section>
  );
}

function ResumoFerramentas({ dados }) {
  const ativas = dados.ferramentas.filter((f) => f.cobranca === 'mensalidade' && !f.cancelada_em);
  const creditos = dados.ferramentas.filter((f) => f.cobranca === 'creditos');
  const fixo = ativas.reduce((s, f) => s + (f.valor_centavos ?? 0), 0);
  const gastoCreditos = creditos.reduce((s, f) => s + f.gasto_mes_centavos, 0);
  return (
    <div className="cartoes cartoes--resumo">
      <Numero rotulo={`Gasto em ${nomeMes(dados.mes)}`}>{formatarDinheiro(dados.total_mes_centavos)}</Numero>
      <Numero rotulo="Assinaturas ativas" detalhe={`${formatarDinheiro(fixo)} por mês`}>{ativas.length}</Numero>
      <Numero rotulo="Por créditos" detalhe={`${formatarDinheiro(gastoCreditos)} em recargas no mês`}>{creditos.length}</Numero>
    </div>
  );
}

function Recargas({ ferramenta, onMudou, onFechar }) {
  const { dados: recargas, erro: erroLista, recarregar } = useCarregar(() => api(`/ferramentas/${ferramenta.id}/recargas`), [ferramenta.id]);
  const { valores, setValores, campo } = useFormulario({ data: hojeISO(), valor: '' });
  const { erros, erro, enviando, executar, setErros } = useEnvio();

  function mudou() {
    recarregar();
    onMudou();
  }

  async function registrar(e) {
    e.preventDefault();
    const valor = paraCentavos(valores.valor);
    if (valor === null || Number.isNaN(valor)) {
      setErros([{ campo: 'valor_centavos', mensagem: valor === null ? 'Obrigatório' : 'Valor inválido' }]);
      return;
    }
    const ok = await executar(() => api(`/ferramentas/${ferramenta.id}/recargas`, { method: 'POST', body: { data: valores.data, valor_centavos: valor } }));
    if (ok) {
      setValores((v) => ({ ...v, valor: '' }));
      mudou();
    }
  }

  async function excluir(recarga) {
    const ok = await executar(() => api(`/ferramentas/recargas/${recarga.id}`, { method: 'DELETE' }).then(() => true));
    if (ok) mudou();
  }

  return (
    <Modal titulo={`Recargas — ${ferramenta.nome}`} onFechar={onFechar}>
      <form onSubmit={registrar} className="form" noValidate>
        <div className="form--linha">
          <Campo rotulo="Data" nome="data" erros={erros} type="date" {...campo('data')} />
          <Campo rotulo="Valor (R$)" nome="valor_centavos" erros={erros} inputMode="decimal" {...campo('valor')} />
        </div>
        <Aviso erro={erro} />
        <div><button className="btn btn--primario" disabled={enviando}>Registrar recarga</button></div>
      </form>
      <Aviso erro={erroLista} />
      {recargas && (recargas.length ? (
        <table className="tabela">
          <tbody>
            {recargas.map((r) => (
              <tr key={r.id}>
                <td>{formatarData(r.data)}</td>
                <td className="num">{formatarDinheiro(r.valor_centavos)}</td>
                <td className="num">
                  <button type="button" className="btn btn--fantasma btn--pequeno" disabled={enviando} aria-label={`Excluir recarga de ${formatarData(r.data)}`} onClick={() => excluir(r)}>Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="vazio">Nenhuma recarga registrada.</p>)}
    </Modal>
  );
}
