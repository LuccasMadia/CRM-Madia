import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { useFormulario } from '../hooks/useFormulario.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Campo } from './Campo.jsx';
import { Aviso } from './Aviso.jsx';
import { paraCentavos, centavosParaTexto } from '../lib/dinheiro.js';
import { hojeISO } from '../lib/datas.js';
import { apenasAtivos } from '../lib/ativos.js';

export function FormPlacaVenda({ inicial = {}, rotuloBotao = 'Salvar', onSalvar }) {
  const { dados: modelos } = useCarregar(() => api('/placas/modelos'), []);
  const { dados: clientes } = useCarregar(() => api('/clientes'), []);
  const { valores, campo, setValores } = useFormulario({
    modelo_id: inicial.modelo_id ? String(inicial.modelo_id) : '',
    quantidade: String(inicial.quantidade ?? 1),
    preco_vendido: centavosParaTexto(inicial.preco_vendido_centavos),
    comprador: inicial.cliente_id ? String(inicial.cliente_id) : (inicial.comprador_nome ? 'avulso' : ''),
    comprador_nome: inicial.comprador_nome ?? '',
    data_venda: inicial.data_venda ?? hojeISO(),
  });
  const { erros, erro, enviando, executar, setErros } = useEnvio();
  const compradorAvulso = valores.comprador === 'avulso';

  function selecionarModelo(e) {
    const modeloId = e.target.value;
    const modelo = (modelos ?? []).find((m) => String(m.id) === modeloId);
    setValores((v) => ({
      ...v,
      modelo_id: modeloId,
      preco_vendido: v.preco_vendido || centavosParaTexto(modelo?.preco_venda_centavos),
    }));
  }

  function enviar(e) {
    e.preventDefault();
    const precoVendido = paraCentavos(valores.preco_vendido);
    if (precoVendido === null || Number.isNaN(precoVendido)) {
      setErros([{ campo: 'preco_vendido_centavos', mensagem: 'Valor inválido' }]);
      return;
    }
    executar(() => onSalvar({
      modelo_id: valores.modelo_id ? Number(valores.modelo_id) : null,
      quantidade: valores.quantidade ? Number(valores.quantidade) : 1,
      preco_vendido_centavos: precoVendido,
      cliente_id: compradorAvulso || !valores.comprador ? null : Number(valores.comprador),
      comprador_nome: compradorAvulso ? valores.comprador_nome : null,
      data_venda: valores.data_venda,
    }));
  }

  return (
    <form onSubmit={enviar} className="form" noValidate>
      <Campo rotulo="Modelo" nome="modelo_id" erros={erros}>
        <select value={valores.modelo_id} onChange={selecionarModelo}>
          <option value="">Selecione…</option>
          {apenasAtivos(modelos, valores.modelo_id).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Quantidade" nome="quantidade" erros={erros} type="number" min="1" {...campo('quantidade')} />
      <Campo rotulo="Preço vendido (R$)" nome="preco_vendido_centavos" erros={erros} inputMode="decimal" {...campo('preco_vendido')} />
      <Campo rotulo="Comprador" nome="comprador" erros={erros}>
        <select {...campo('comprador')}>
          <option value="">Selecione…</option>
          {(clientes ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          <option value="avulso">Comprador avulso (sem cadastro)</option>
        </select>
      </Campo>
      {compradorAvulso && (
        <Campo rotulo="Nome do comprador avulso" nome="comprador_nome" erros={erros} {...campo('comprador_nome')} />
      )}
      <Campo rotulo="Data da venda" nome="data_venda" erros={erros} type="date" {...campo('data_venda')} />
      <Aviso erro={erro} />
      <div><button className="btn btn--primario" disabled={enviando}>{rotuloBotao}</button></div>
    </form>
  );
}
