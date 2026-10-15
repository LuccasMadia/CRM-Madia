import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { ROTULO_TIPO_SERVICO, TIPOS_SERVICO } from '../lib/rotulos.js';
import { apenasAtivos } from '../lib/ativos.js';
import { paraCentavos, centavosParaTexto, formatarDinheiro } from '../lib/dinheiro.js';

function linhaInicial(tipo, modelos, config) {
  if (tipo === 'placas_nfc') {
    const modelo = apenasAtivos(modelos)[0];
    return {
      tipo, modelo_id: modelo ? String(modelo.id) : '', quantidade: '1',
      valor: modelo ? centavosParaTexto(modelo.preco_venda_centavos) : '0,00', manual: false, sugerido: null,
    };
  }
  const precoPadrao = config?.[`preco_servico_${tipo}_centavos`] ?? 0;
  return { tipo, modelo_id: '', quantidade: '1', valor: centavosParaTexto(precoPadrao) };
}

function linhaExistente(s) {
  if (s.tipo !== 'placas_nfc') {
    return { tipo: s.tipo, modelo_id: '', quantidade: '1', valor: centavosParaTexto(s.valor_unitario_centavos ?? 0) };
  }
  const total = s.valor_total_centavos ?? (s.valor_unitario_centavos ?? 0) * (s.quantidade ?? 1);
  return {
    tipo: s.tipo, modelo_id: s.modelo_id ? String(s.modelo_id) : '', quantidade: String(s.quantidade ?? 1),
    valor: centavosParaTexto(total), manual: true, sugerido: null,
  };
}

function paraSaida(linhas, descontoTexto) {
  return {
    servicos: linhas.map((l) => (
      l.tipo === 'placas_nfc'
        ? { tipo: l.tipo, modelo_id: Number(l.modelo_id) || null, quantidade: Number(l.quantidade) || 1, valor_total_centavos: paraCentavos(l.valor) || 0 }
        : { tipo: l.tipo, valor_unitario_centavos: paraCentavos(l.valor) || 0 }
    )),
    desconto_centavos: paraCentavos(descontoTexto) || 0,
  };
}

function etiquetaPlacas(linha) {
  if (!linha.sugerido) return null;
  if (linha.sugerido.recompra) {
    const n = linha.sugerido.ja_comprou;
    return `Cliente já comprou ${n} ${n === 1 ? 'placa' : 'placas'} — preço de recompra`;
  }
  return Number(linha.quantidade) >= 2 ? 'Preço de pack' : null;
}

export function CamposServicos({ servicos, desconto, clienteId = null, projetoId = null, onChange }) {
  const { dados: modelos } = useCarregar(() => api('/placas/modelos'), []);
  const { dados: config } = useCarregar(() => api('/config'), []);
  const [linhas, setLinhas] = useState((servicos ?? []).map(linhaExistente));
  const [descontoTexto, setDescontoTexto] = useState(centavosParaTexto(desconto ?? 0));
  const linhasRef = useRef(linhas);
  const descontoRef = useRef(descontoTexto);

  function aplicar(proximas, proximoDesconto = descontoRef.current) {
    linhasRef.current = proximas;
    descontoRef.current = proximoDesconto;
    setLinhas(proximas);
    setDescontoTexto(proximoDesconto);
    onChange(paraSaida(proximas, proximoDesconto));
  }

  const placas = linhas.find((l) => l.tipo === 'placas_nfc');
  const quantidadePlacas = Number(placas?.quantidade);
  const chavePreco = placas && placas.modelo_id && Number.isInteger(quantidadePlacas) && quantidadePlacas >= 1
    ? `${placas.modelo_id}|${quantidadePlacas}|${clienteId ?? ''}|${projetoId ?? ''}`
    : null;

  useEffect(() => {
    if (!chavePreco) return undefined;
    let ativo = true;
    const [modeloId, quantidade] = chavePreco.split('|');
    const params = new URLSearchParams({ quantidade });
    if (clienteId) params.set('cliente_id', String(clienteId));
    if (projetoId) params.set('projeto_id', String(projetoId));
    api(`/placas/modelos/${modeloId}/preco?${params}`).then(
      (sugerido) => {
        if (!ativo) return;
        aplicar(linhasRef.current.map((l) => (
          l.tipo !== 'placas_nfc' ? l : { ...l, sugerido, valor: l.manual ? l.valor : centavosParaTexto(sugerido.total_centavos) }
        )));
      },
      () => {},
    );
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chavePreco]);

  function alternar(tipo, marcado) {
    const atuais = linhasRef.current;
    aplicar(marcado ? [...atuais, linhaInicial(tipo, modelos, config)] : atuais.filter((l) => l.tipo !== tipo));
  }

  function alterarLinha(tipo, campo, valor) {
    aplicar(linhasRef.current.map((l) => {
      if (l.tipo !== tipo) return l;
      if (campo === 'valor' && tipo === 'placas_nfc') return { ...l, valor, manual: true };
      return { ...l, [campo]: valor };
    }));
  }

  function usarSugerido() {
    aplicar(linhasRef.current.map((l) => (
      l.tipo === 'placas_nfc' && l.sugerido ? { ...l, manual: false, valor: centavosParaTexto(l.sugerido.total_centavos) } : l
    )));
  }

  const subtotal = linhas.reduce((soma, l) => soma + (paraCentavos(l.valor) || 0), 0);
  const total = Math.max(0, subtotal - (paraCentavos(descontoTexto) || 0));

  return (
    <div className="campos-servicos">
      <fieldset>
        <legend>Serviços</legend>
        {TIPOS_SERVICO.map((tipo) => {
          const linha = linhas.find((l) => l.tipo === tipo);
          const ehPlacas = tipo === 'placas_nfc';
          const sugeridoDiferente = ehPlacas && linha?.manual && linha.sugerido
            && paraCentavos(linha.valor) !== linha.sugerido.total_centavos;
          const etiqueta = ehPlacas && linha ? etiquetaPlacas(linha) : null;
          return (
            <div className="campos-servicos__linha" key={tipo}>
              <label>
                <input type="checkbox" checked={Boolean(linha)} onChange={(e) => alternar(tipo, e.target.checked)} />{' '}
                {ROTULO_TIPO_SERVICO[tipo]}
              </label>
              {linha && ehPlacas && (
                <>
                  <select aria-label="Modelo da placa" value={linha.modelo_id} onChange={(e) => alterarLinha(tipo, 'modelo_id', e.target.value)}>
                    <option value="">Selecione…</option>
                    {apenasAtivos(modelos, linha.modelo_id).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </select>
                  <input aria-label="Quantidade de placas" type="number" min="1" value={linha.quantidade} onChange={(e) => alterarLinha(tipo, 'quantidade', e.target.value)} />
                </>
              )}
              {linha && (
                <input
                  aria-label={ehPlacas ? 'Valor total das placas' : `Valor de ${ROTULO_TIPO_SERVICO[tipo]}`}
                  inputMode="decimal"
                  value={linha.valor}
                  onChange={(e) => alterarLinha(tipo, 'valor', e.target.value)}
                />
              )}
              {sugeridoDiferente && (
                <button type="button" className="btn btn--fantasma btn--pequeno" onClick={usarSugerido}>
                  {`usar preço sugerido (${formatarDinheiro(linha.sugerido.total_centavos)})`}
                </button>
              )}
              {etiqueta && <span className="campos-servicos__etiqueta">{etiqueta}</span>}
            </div>
          );
        })}
      </fieldset>
      <div className="campos-servicos__linha">
        <label htmlFor="campos-servicos-desconto">Desconto (R$)</label>
        <input id="campos-servicos-desconto" inputMode="decimal" value={descontoTexto} onChange={(e) => aplicar(linhasRef.current, e.target.value)} />
      </div>
      <p className="campos-servicos__total">Subtotal: {formatarDinheiro(subtotal)} — Total: {formatarDinheiro(total)}</p>
    </div>
  );
}
