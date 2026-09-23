import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useFormulario } from '../../hooks/useFormulario.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { Campo } from '../../components/Campo.jsx';
import { Aviso } from '../../components/Aviso.jsx';
import { Numero } from '../../components/Numero.jsx';
import { formatarDinheiro, paraCentavos } from '../../lib/dinheiro.js';
import { formatarData, hojeISO } from '../../lib/datas.js';
import { ROTULO_ESTADO_PARCELA } from '../../lib/rotulos.js';

const VAZIO = { descricao: '', valor: '', vencimento: '' };

export function AbaFinanceiro({ projeto }) {
  const { dados, erro, recarregar } = useCarregar(() => api(`/projetos/${projeto.id}/parcelas`), [projeto.id]);
  const { valores, campo, setValores } = useFormulario(VAZIO);
  const envio = useEnvio();

  const acao = (fn) => envio.executar(async () => { await fn(); recarregar(); });
  const atualizar = (parcela, corpo) => acao(() => api(`/parcelas/${parcela.id}`, { method: 'PUT', body: corpo }));

  function adicionar(e) {
    e.preventDefault();
    const valor = paraCentavos(valores.valor);
    if (valor === null || Number.isNaN(valor)) {
      envio.setErros([{ campo: 'valor_centavos', mensagem: 'Informe um valor válido' }]);
      return;
    }
    acao(async () => {
      await api(`/projetos/${projeto.id}/parcelas`, {
        method: 'POST',
        body: { descricao: valores.descricao, valor_centavos: valor, vencimento: valores.vencimento },
      });
      setValores(VAZIO);
    });
  }

  if (erro) return <Aviso erro={erro} />;
  if (!dados) return <p>Carregando…</p>;
  const { parcelas, resumo } = dados;
  const acima = resumo.nao_parcelado_centavos < 0;

  return (
    <>
      <div className="cartoes">
        <Numero rotulo="Recebido">{formatarDinheiro(resumo.pago_centavos)}</Numero>
        <Numero rotulo="A receber">{formatarDinheiro(resumo.pendente_centavos)}</Numero>
        <Numero rotulo="Atrasado">{formatarDinheiro(resumo.atrasado_centavos)}</Numero>
        <Numero rotulo={acima ? 'Parcelas acima do valor' : 'Não parcelado'}>
          {formatarDinheiro(Math.abs(resumo.nao_parcelado_centavos))}
        </Numero>
      </div>

      <div className="cartao">
        {parcelas.length ? (
          <table className="tabela">
            <thead>
              <tr><th>Descrição</th><th className="num">Valor</th><th>Vencimento</th><th>Estado</th><th>Pagamento</th><th /></tr>
            </thead>
            <tbody>
              {parcelas.map((p) => {
                const nome = p.descricao || `Parcela de ${formatarData(p.vencimento)}`;
                return (
                  <tr key={p.id}>
                    <td>{nome}</td>
                    <td className="num">{formatarDinheiro(p.valor_centavos)}</td>
                    <td>{formatarData(p.vencimento)}</td>
                    <td><span className={`etiqueta etiqueta--${p.estado}`}>{ROTULO_ESTADO_PARCELA[p.estado]}</span></td>
                    <td>
                      {p.pago_em ? (
                        <>
                          <input
                            type="date"
                            aria-label={`Data de pagamento de ${nome}`}
                            value={p.pago_em}
                            onChange={(e) => e.target.value && atualizar(p, { pago_em: e.target.value })}
                          />{' '}
                          <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => atualizar(p, { pago_em: null })}>Desfazer</button>
                        </>
                      ) : (
                        <button type="button" className="btn btn--pequeno" aria-label={`Marcar ${nome} como paga`} onClick={() => atualizar(p, { pago_em: hojeISO() })}>
                          Marcar como pago
                        </button>
                      )}
                    </td>
                    <td>
                      <button type="button" className="btn btn--fantasma btn--pequeno" aria-label={`Excluir ${nome}`} onClick={() => acao(() => api(`/parcelas/${p.id}`, { method: 'DELETE' }))}>×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <p className="vazio">Nenhuma parcela cadastrada.</p>}

        <form onSubmit={adicionar} className="form form--linha" noValidate>
          <Campo rotulo="Descrição" nome="descricao" erros={envio.erros} placeholder="Entrada 50%" {...campo('descricao')} />
          <Campo rotulo="Valor da parcela (R$)" nome="valor_centavos" erros={envio.erros} inputMode="decimal" {...campo('valor')} />
          <Campo rotulo="Vencimento" nome="vencimento" erros={envio.erros} type="date" {...campo('vencimento')} />
          <button className="btn btn--primario" disabled={envio.enviando}>Adicionar parcela</button>
        </form>
        <Aviso erro={envio.erro} />
      </div>
    </>
  );
}
