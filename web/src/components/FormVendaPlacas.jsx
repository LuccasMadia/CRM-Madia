import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { usePrecoSugeridoPlacas } from '../hooks/usePrecoSugeridoPlacas.js';
import { Campo } from './Campo.jsx';
import { Aviso } from './Aviso.jsx';
import { apenasAtivos } from '../lib/ativos.js';
import { paraCentavos, centavosParaTexto, formatarDinheiro } from '../lib/dinheiro.js';

function etiquetaPreco(sugerido, quantidade) {
  if (!sugerido) return null;
  if (sugerido.recompra) {
    const n = sugerido.ja_comprou;
    return `Cliente já comprou ${n} ${n === 1 ? 'placa' : 'placas'} — preço de recompra`;
  }
  return quantidade >= 2 ? 'Preço de pack' : null;
}

export function FormVendaPlacas({ cliente, projeto = null, parcela = null, onSalvar }) {
  const linha = projeto?.servicos?.find((s) => s.tipo === 'placas_nfc') ?? null;
  const entregue = Boolean(linha?.venda_id);
  const { dados: modelos } = useCarregar(() => api('/placas/modelos'), []);
  const [modeloId, setModeloId] = useState(linha ? String(linha.modelo_id) : '');
  const [quantidadeTexto, setQuantidadeTexto] = useState(String(linha?.quantidade ?? 1));
  const [valor, setValor] = useState(linha ? centavosParaTexto(linha.valor_total_centavos) : '');
  const [manual, setManual] = useState(Boolean(linha));
  const [vencimento, setVencimento] = useState(parcela?.vencimento ?? '');
  const [qrcodes, setQrcodes] = useState((projeto?.qrcodes ?? []).map((q) => q.id));
  const [notas, setNotas] = useState(projeto?.notas ?? '');
  const { erros, erro, enviando, executar, setErros } = useEnvio();
  const quantidade = Number(quantidadeTexto);

  useEffect(() => {
    if (!modeloId && modelos) {
      const [primeiro] = apenasAtivos(modelos);
      if (primeiro) setModeloId(String(primeiro.id));
    }
  }, [modelos, modeloId]);

  const sugerido = usePrecoSugeridoPlacas({
    modeloId: entregue ? null : modeloId, quantidade, clienteId: cliente.id, projetoId: projeto?.id ?? null,
  });

  useEffect(() => {
    if (sugerido && !manual) setValor(centavosParaTexto(sugerido.total_centavos));
  }, [sugerido, manual]);

  function alternarQr(qrId, marcado) {
    setQrcodes((atuais) => (marcado ? [...atuais, qrId] : atuais.filter((q) => q !== qrId)));
  }

  function enviar(e) {
    e.preventDefault();
    const corpo = projeto ? {} : { servico: 'placas_nfc', titulo: 'Placas NFC', cliente_id: cliente.id };
    if (!entregue) {
      const valorCentavos = paraCentavos(valor);
      if (Number.isNaN(valorCentavos)) {
        setErros([{ campo: 'valor', mensagem: 'Valor inválido' }]);
        return;
      }
      corpo.servicos = [{ tipo: 'placas_nfc', modelo_id: Number(modeloId) || null, quantidade: quantidade || 1, valor_total_centavos: valorCentavos ?? 0 }];
    }
    Object.assign(corpo, { vencimento, qrcodes, notas });
    executar(() => onSalvar(corpo));
  }

  const sugeridoDiferente = manual && sugerido && paraCentavos(valor) !== sugerido.total_centavos;
  const etiqueta = entregue ? null : etiquetaPreco(sugerido, quantidade);
  const travadoPago = Boolean(parcela?.pago_em);

  return (
    <form onSubmit={enviar} className="form" noValidate>
      <Campo rotulo="Modelo da placa" nome="servicos" erros={erros}>
        <select value={modeloId} disabled={entregue} onChange={(e) => setModeloId(e.target.value)}>
          <option value="">Selecione…</option>
          {apenasAtivos(modelos ?? [], modeloId).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Quantidade" nome="quantidade" erros={erros} type="number" min="1" disabled={entregue}
        value={quantidadeTexto} onChange={(e) => setQuantidadeTexto(e.target.value)} />
      <Campo rotulo="Valor total" nome="valor" erros={erros} inputMode="decimal" disabled={entregue || travadoPago}
        value={valor} onChange={(e) => { setValor(e.target.value); setManual(true); }} />
      {sugeridoDiferente && !entregue && (
        <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => { setManual(false); setValor(centavosParaTexto(sugerido.total_centavos)); }}>
          {`usar preço sugerido (${formatarDinheiro(sugerido.total_centavos)})`}
        </button>
      )}
      {etiqueta && <p className="campos-servicos__etiqueta">{etiqueta}</p>}
      {entregue && <p className="vazio">Venda já entregue: modelo, quantidade e valor não mudam mais.</p>}
      <Campo rotulo="Vencimento" nome="vencimento" erros={erros} type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
      <fieldset className="campo">
        <legend>QR codes</legend>
        {cliente.qrcodes.length ? cliente.qrcodes.map((q) => (
          <label key={q.id} style={{ display: 'block' }}>
            <input type="checkbox" checked={qrcodes.includes(q.id)} onChange={(e) => alternarQr(q.id, e.target.checked)} />{` #${q.id} ${q.nome}`}
          </label>
        )) : <p className="vazio">Este cliente ainda não tem QR codes.</p>}
      </fieldset>
      <Campo rotulo="Observações" nome="notas" erros={erros}>
        <textarea rows={3} value={notas} onChange={(e) => setNotas(e.target.value)} />
      </Campo>
      <Aviso erro={erro} />
      <div><button className="btn btn--primario" disabled={enviando}>Salvar</button></div>
    </form>
  );
}
