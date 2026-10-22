import { Campo } from '../../components/Campo.jsx';
import { formatarData } from '../../lib/datas.js';
import { inicioMensalidade } from '../../../../server/domain/mensalidade.js';

const MODOS = [
  ['entrega', 'Na entrega'],
  ['desenvolvimento', 'Ao entrar em desenvolvimento'],
  ['data', 'A partir de uma data'],
];

const SEM_INICIO = {
  entrega: 'Começa quando o projeto for entregue',
  desenvolvimento: 'Começa quando entrar em desenvolvimento',
  data: 'Escolha a data de início da cobrança',
};

export function frasePrimeiraMensalidade(valores) {
  const inicio = inicioMensalidade(valores);
  return inicio ? `1ª mensalidade em ${formatarData(inicio)}` : SEM_INICIO[valores.mensalidade_inicio_modo];
}

// O dia de vencimento acompanha a data de início da cobrança enquanto o Lucca não digitar outro (dia_manual).
// Aplique a cada mudança do formulário: assim vale para o checkbox, o modo e as datas de Prazos.
export function comDiaSugerido(valores) {
  if (!valores.mensalidade_ativa || valores.dia_manual) return valores;
  const inicio = inicioMensalidade(valores);
  return inicio ? { ...valores, mensalidade_dia_vencimento: String(Number(inicio.slice(8, 10))) } : valores;
}

// `valores` usa os nomes do servidor (data_inicio, data_entrega, mensalidade_*); `alterar(parcial)` mescla no
// formulário e deve passar o resultado por `comDiaSugerido`.
// comInicio=false esconde "Começa a cobrar" (GMN começa ao ligar). ativaAntes: a mensalidade estava ligada quando o
// formulário abriu; desligar oferece apagar as que ainda não venceram (apagar_mensalidades_abertas).
export function CobrancaMensal({ valores, alterar, erros, comInicio = true, ativaAntes = false }) {
  return (
    <>
      <label className="campo--check">
        <input type="checkbox" checked={Boolean(valores.mensalidade_ativa)} onChange={(e) => alterar({ mensalidade_ativa: e.target.checked })} />
        Cobra mensalidade
      </label>
      {ativaAntes && !valores.mensalidade_ativa && (
        <label className="campo--check">
          <input type="checkbox" checked={Boolean(valores.apagar_mensalidades_abertas)}
            onChange={(e) => alterar({ apagar_mensalidades_abertas: e.target.checked })} />
          Apagar as mensalidades em aberto que ainda não venceram (as atrasadas continuam)
        </label>
      )}
      {valores.mensalidade_ativa && (
        <div className="cobranca-mensal">
          <div className="grade-campos">
            <Campo rotulo="Valor da mensalidade (R$)" nome="mensalidade_valor_centavos" erros={erros} inputMode="decimal"
              value={valores.mensalidade_valor} onChange={(e) => alterar({ mensalidade_valor: e.target.value })} />
            <Campo rotulo="Dia de vencimento" nome="mensalidade_dia_vencimento" erros={erros} type="number" min="1" max="31"
              value={valores.mensalidade_dia_vencimento} onChange={(e) => alterar({ mensalidade_dia_vencimento: e.target.value, dia_manual: true })} />
          </div>
          {comInicio && (
            <>
              <fieldset className="campo">
                <legend>Começa a cobrar</legend>
                {MODOS.map(([modo, rotulo]) => (
                  <label key={modo} className="campo--check">
                    <input type="radio" name="mensalidade_inicio_modo" value={modo} checked={valores.mensalidade_inicio_modo === modo}
                      onChange={() => alterar({ mensalidade_inicio_modo: modo })} />
                    {rotulo}
                  </label>
                ))}
              </fieldset>
              {valores.mensalidade_inicio_modo === 'data' && (
                <Campo rotulo="Data de início da cobrança" nome="mensalidade_inicio_data" erros={erros} type="date"
                  value={valores.mensalidade_inicio_data} onChange={(e) => alterar({ mensalidade_inicio_data: e.target.value })} />
              )}
              <p className="vazio">{frasePrimeiraMensalidade(valores)}</p>
            </>
          )}
        </div>
      )}
    </>
  );
}
