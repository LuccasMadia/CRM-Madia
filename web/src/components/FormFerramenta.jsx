import { useFormulario } from '../hooks/useFormulario.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Campo } from './Campo.jsx';
import { Aviso } from './Aviso.jsx';
import { paraCentavos, centavosParaTexto } from '../lib/dinheiro.js';

export function FormFerramenta({ inicial = {}, rotuloBotao = 'Salvar', onSalvar }) {
  const { valores, campo } = useFormulario({
    nome: inicial.nome ?? '',
    cobranca: inicial.cobranca ?? 'mensalidade',
    valor: centavosParaTexto(inicial.valor_centavos),
    dia_cobranca: inicial.dia_cobranca ?? '',
    observacao: inicial.observacao ?? '',
  });
  const { erros, erro, enviando, executar, setErros } = useEnvio();
  const mensalidade = valores.cobranca === 'mensalidade';

  function enviar(e) {
    e.preventDefault();
    const dados = { nome: valores.nome, cobranca: valores.cobranca, observacao: valores.observacao };
    if (mensalidade) {
      const valor = paraCentavos(valores.valor);
      if (valor === null || Number.isNaN(valor)) {
        setErros([{ campo: 'valor_centavos', mensagem: valor === null ? 'Obrigatório' : 'Valor inválido' }]);
        return;
      }
      dados.valor_centavos = valor;
      dados.dia_cobranca = valores.dia_cobranca === '' ? null : Number(valores.dia_cobranca);
    }
    executar(() => onSalvar(dados));
  }

  return (
    <form onSubmit={enviar} className="form" noValidate>
      <Campo rotulo="Nome" nome="nome" erros={erros} {...campo('nome')} />
      <Campo rotulo="Como paga" nome="cobranca" erros={erros}>
        <select {...campo('cobranca')}>
          <option value="mensalidade">Mensalidade (valor fixo todo mês)</option>
          <option value="creditos">Créditos (recargas quando precisa)</option>
        </select>
      </Campo>
      {mensalidade && (
        <div className="form--linha">
          <Campo rotulo="Valor por mês (R$)" nome="valor_centavos" erros={erros} inputMode="decimal" {...campo('valor')} />
          <Campo rotulo="Dia da cobrança" nome="dia_cobranca" erros={erros} type="number" min="1" max="31" {...campo('dia_cobranca')} />
        </div>
      )}
      {mensalidade && <p className="form__ajuda">O valor em reais que vem na fatura.</p>}
      <Campo rotulo="Observação" nome="observacao" erros={erros}><textarea rows={2} {...campo('observacao')} /></Campo>
      <Aviso erro={erro} />
      <div><button className="btn btn--primario" disabled={enviando}>{rotuloBotao}</button></div>
    </form>
  );
}
