import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { useFormulario } from '../hooks/useFormulario.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Campo } from './Campo.jsx';
import { Aviso } from './Aviso.jsx';
import { paraCentavos, centavosParaTexto } from '../lib/dinheiro.js';
import { hojeISO } from '../lib/datas.js';

export function FormPlacaLote({ inicial = {}, rotuloBotao = 'Salvar', onSalvar }) {
  const { dados: materiais } = useCarregar(() => api('/placas/materiais'), []);
  const { valores, campo } = useFormulario({
    material_id: inicial.material_id ? String(inicial.material_id) : '',
    nome_lote: inicial.nome_lote ?? '',
    quantidade: inicial.quantidade ? String(inicial.quantidade) : '',
    valor_kit: centavosParaTexto(inicial.valor_kit_centavos),
    valor_frete: centavosParaTexto(inicial.valor_frete_centavos ?? 0),
    data_compra: inicial.data_compra ?? hojeISO(),
  });
  const { erros, erro, enviando, executar, setErros } = useEnvio();

  function enviar(e) {
    e.preventDefault();
    const valorKit = paraCentavos(valores.valor_kit);
    if (valorKit === null || Number.isNaN(valorKit)) {
      setErros([{ campo: 'valor_kit_centavos', mensagem: 'Valor inválido' }]);
      return;
    }
    const valorFrete = valores.valor_frete ? paraCentavos(valores.valor_frete) : 0;
    if (Number.isNaN(valorFrete)) {
      setErros([{ campo: 'valor_frete_centavos', mensagem: 'Valor inválido' }]);
      return;
    }
    executar(() => onSalvar({
      material_id: valores.material_id ? Number(valores.material_id) : null,
      nome_lote: valores.nome_lote,
      quantidade: valores.quantidade ? Number(valores.quantidade) : null,
      valor_kit_centavos: valorKit,
      valor_frete_centavos: valorFrete ?? 0,
      data_compra: valores.data_compra,
    }));
  }

  return (
    <form onSubmit={enviar} className="form" noValidate>
      <Campo rotulo="Material" nome="material_id" erros={erros}>
        <select {...campo('material_id')}>
          <option value="">Selecione…</option>
          {(materiais ?? []).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Nome do lote (opcional)" nome="nome_lote" erros={erros} {...campo('nome_lote')} />
      <Campo rotulo="Quantidade" nome="quantidade" erros={erros} type="number" min="1" {...campo('quantidade')} />
      <Campo rotulo="Valor do kit (R$)" nome="valor_kit_centavos" erros={erros} inputMode="decimal" {...campo('valor_kit')} />
      <Campo rotulo="Valor do frete (R$)" nome="valor_frete_centavos" erros={erros} inputMode="decimal" {...campo('valor_frete')} />
      <Campo rotulo="Data da compra" nome="data_compra" erros={erros} type="date" {...campo('data_compra')} />
      <Aviso erro={erro} />
      <div><button className="btn btn--primario" disabled={enviando}>{rotuloBotao}</button></div>
    </form>
  );
}
