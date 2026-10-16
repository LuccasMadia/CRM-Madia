import { useState } from 'react';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { ROTULO_TIPO_SERVICO, TIPOS_SERVICO_SITE } from '../lib/rotulos.js';
import { paraCentavos, centavosParaTexto, formatarDinheiro } from '../lib/dinheiro.js';

function linhaInicial(tipo, config) {
  return { tipo, valor: centavosParaTexto(config?.[`preco_servico_${tipo}_centavos`] ?? 0) };
}

const linhaExistente = (s) => ({ tipo: s.tipo, valor: centavosParaTexto(s.valor_unitario_centavos ?? 0) });

function paraSaida(linhas, descontoTexto) {
  return {
    servicos: linhas.map((l) => ({ tipo: l.tipo, valor_unitario_centavos: paraCentavos(l.valor) || 0 })),
    desconto_centavos: paraCentavos(descontoTexto) || 0,
  };
}

export function CamposServicos({ servicos, desconto, onChange }) {
  const { dados: config } = useCarregar(() => api('/config'), []);
  const [linhas, setLinhas] = useState((servicos ?? []).map(linhaExistente));
  const [descontoTexto, setDescontoTexto] = useState(centavosParaTexto(desconto ?? 0));

  function aplicar(proximas, proximoDesconto = descontoTexto) {
    setLinhas(proximas);
    setDescontoTexto(proximoDesconto);
    onChange(paraSaida(proximas, proximoDesconto));
  }

  function alternar(tipo, marcado) {
    aplicar(marcado ? [...linhas, linhaInicial(tipo, config)] : linhas.filter((l) => l.tipo !== tipo));
  }

  function alterarValor(tipo, valor) {
    aplicar(linhas.map((l) => (l.tipo === tipo ? { ...l, valor } : l)));
  }

  const subtotal = linhas.reduce((soma, l) => soma + (paraCentavos(l.valor) || 0), 0);
  const total = Math.max(0, subtotal - (paraCentavos(descontoTexto) || 0));

  return (
    <div className="campos-servicos">
      <fieldset>
        <legend>Serviços</legend>
        {TIPOS_SERVICO_SITE.map((tipo) => {
          const linha = linhas.find((l) => l.tipo === tipo);
          return (
            <div className="campos-servicos__linha" key={tipo}>
              <label>
                <input type="checkbox" checked={Boolean(linha)} onChange={(e) => alternar(tipo, e.target.checked)} />{' '}
                {ROTULO_TIPO_SERVICO[tipo]}
              </label>
              {linha && (
                <input
                  aria-label={`Valor de ${ROTULO_TIPO_SERVICO[tipo]}`}
                  inputMode="decimal"
                  value={linha.valor}
                  onChange={(e) => alterarValor(tipo, e.target.value)}
                />
              )}
            </div>
          );
        })}
      </fieldset>
      <div className="campos-servicos__linha">
        <label htmlFor="campos-servicos-desconto">Desconto (R$)</label>
        <input id="campos-servicos-desconto" inputMode="decimal" value={descontoTexto} onChange={(e) => aplicar(linhas, e.target.value)} />
      </div>
      <p className="campos-servicos__total">Subtotal: {formatarDinheiro(subtotal)} — Total: {formatarDinheiro(total)}</p>
    </div>
  );
}
