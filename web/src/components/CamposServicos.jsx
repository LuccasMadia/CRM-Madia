import { useState } from 'react';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { ROTULO_TIPO_SERVICO, TIPOS_SERVICO } from '../lib/rotulos.js';
import { apenasAtivos } from '../lib/ativos.js';
import { paraCentavos, centavosParaTexto, formatarDinheiro } from '../lib/dinheiro.js';

function linhaInicial(tipo, modelos, config) {
  if (tipo === 'placas_nfc') {
    const modelo = apenasAtivos(modelos)[0];
    return { tipo, modelo_id: modelo ? String(modelo.id) : '', quantidade: '1', valor: modelo ? centavosParaTexto(modelo.preco_venda_centavos) : '0,00' };
  }
  const precoPadrao = config?.[`preco_servico_${tipo}_centavos`] ?? 0;
  return { tipo, modelo_id: '', quantidade: '1', valor: centavosParaTexto(precoPadrao) };
}

function paraSaida(linhas, descontoTexto) {
  return {
    servicos: linhas.map((l) => (
      l.tipo === 'placas_nfc'
        ? { tipo: l.tipo, modelo_id: Number(l.modelo_id) || null, quantidade: Number(l.quantidade) || 1, valor_unitario_centavos: paraCentavos(l.valor) || 0 }
        : { tipo: l.tipo, valor_unitario_centavos: paraCentavos(l.valor) || 0 }
    )),
    desconto_centavos: paraCentavos(descontoTexto) || 0,
  };
}

export function CamposServicos({ servicos, desconto, onChange }) {
  const { dados: modelos } = useCarregar(() => api('/placas/modelos'), []);
  const { dados: config } = useCarregar(() => api('/config'), []);
  const [linhas, setLinhas] = useState(
    (servicos ?? []).map((s) => ({
      tipo: s.tipo,
      modelo_id: s.modelo_id ? String(s.modelo_id) : '',
      quantidade: String(s.quantidade ?? 1),
      valor: centavosParaTexto(s.valor_unitario_centavos ?? 0),
    })),
  );
  const [descontoTexto, setDescontoTexto] = useState(centavosParaTexto(desconto ?? 0));

  function alternar(tipo, marcado) {
    const proximas = marcado ? [...linhas, linhaInicial(tipo, modelos, config)] : linhas.filter((l) => l.tipo !== tipo);
    setLinhas(proximas);
    onChange(paraSaida(proximas, descontoTexto));
  }

  function alterarLinha(tipo, campo, valor) {
    const proximas = linhas.map((l) => {
      if (l.tipo !== tipo) return l;
      if (campo === 'modelo_id') {
        const modelo = (modelos ?? []).find((m) => String(m.id) === valor);
        return { ...l, modelo_id: valor, valor: modelo ? centavosParaTexto(modelo.preco_venda_centavos) : l.valor };
      }
      return { ...l, [campo]: valor };
    });
    setLinhas(proximas);
    onChange(paraSaida(proximas, descontoTexto));
  }

  function alterarDesconto(valor) {
    setDescontoTexto(valor);
    onChange(paraSaida(linhas, valor));
  }

  const subtotal = linhas.reduce((soma, l) => soma + (paraCentavos(l.valor) || 0) * (l.tipo === 'placas_nfc' ? (Number(l.quantidade) || 1) : 1), 0);
  const total = Math.max(0, subtotal - (paraCentavos(descontoTexto) || 0));

  return (
    <div className="campos-servicos">
      <fieldset>
        <legend>Serviços</legend>
        {TIPOS_SERVICO.map((tipo) => {
          const linha = linhas.find((l) => l.tipo === tipo);
          return (
            <div className="campos-servicos__linha" key={tipo}>
              <label>
                <input type="checkbox" checked={Boolean(linha)} onChange={(e) => alternar(tipo, e.target.checked)} />{' '}
                {ROTULO_TIPO_SERVICO[tipo]}
              </label>
              {linha && tipo === 'placas_nfc' && (
                <>
                  <select aria-label="Modelo da placa" value={linha.modelo_id} onChange={(e) => alterarLinha(tipo, 'modelo_id', e.target.value)}>
                    <option value="">Selecione…</option>
                    {apenasAtivos(modelos, linha.modelo_id).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </select>
                  <input aria-label="Quantidade de placas" type="number" min="1" value={linha.quantidade} onChange={(e) => alterarLinha(tipo, 'quantidade', e.target.value)} />
                </>
              )}
              {linha && (
                <input aria-label={`Valor de ${ROTULO_TIPO_SERVICO[tipo]}`} inputMode="decimal" value={linha.valor} onChange={(e) => alterarLinha(tipo, 'valor', e.target.value)} />
              )}
            </div>
          );
        })}
      </fieldset>
      <div className="campos-servicos__linha">
        <label htmlFor="campos-servicos-desconto">Desconto (R$)</label>
        <input id="campos-servicos-desconto" inputMode="decimal" value={descontoTexto} onChange={(e) => alterarDesconto(e.target.value)} />
      </div>
      <p className="campos-servicos__total">Subtotal: {formatarDinheiro(subtotal)} — Total: {formatarDinheiro(total)}</p>
    </div>
  );
}
