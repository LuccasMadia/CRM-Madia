import { useState } from 'react';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { useFormulario } from '../hooks/useFormulario.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Campo } from './Campo.jsx';
import { Aviso } from './Aviso.jsx';
import { paraCentavos, centavosParaTexto } from '../lib/dinheiro.js';
import { apenasAtivos } from '../lib/ativos.js';

export function FormPlacaModelo({ inicial = {}, rotuloBotao = 'Salvar', onSalvar }) {
  const { dados: materiais } = useCarregar(() => api('/placas/materiais'), []);
  const { valores, campo } = useFormulario({
    nome: inicial.nome ?? '',
    preco_venda: centavosParaTexto(inicial.preco_venda_centavos),
  });
  const [itens, setItens] = useState(
    (inicial.itens ?? []).map((i) => ({ material_id: String(i.material_id), quantidade: String(i.quantidade) })),
  );
  const { erros, erro, enviando, executar, setErros } = useEnvio();

  function adicionarItem() {
    setItens((atual) => [...atual, { material_id: '', quantidade: '1' }]);
  }

  function removerItem(indice) {
    setItens((atual) => atual.filter((_, i) => i !== indice));
  }

  function alterarItem(indice, campoItem, valor) {
    setItens((atual) => atual.map((item, i) => (i === indice ? { ...item, [campoItem]: valor } : item)));
  }

  function enviar(e) {
    e.preventDefault();
    const precoVenda = paraCentavos(valores.preco_venda);
    if (precoVenda === null || Number.isNaN(precoVenda)) {
      setErros([{ campo: 'preco_venda_centavos', mensagem: 'Valor inválido' }]);
      return;
    }
    executar(() => onSalvar({
      nome: valores.nome,
      preco_venda_centavos: precoVenda,
      itens: itens.map((i) => ({ material_id: Number(i.material_id), quantidade: Number(i.quantidade) })),
    }));
  }

  return (
    <form onSubmit={enviar} className="form" noValidate>
      <Campo rotulo="Nome" nome="nome" erros={erros} {...campo('nome')} />
      <Campo rotulo="Preço de venda (R$)" nome="preco_venda_centavos" erros={erros} inputMode="decimal" {...campo('preco_venda')} />
      <fieldset>
        <legend>Receita (materiais usados)</legend>
        {itens.map((item, indice) => (
          <div className="form--linha" key={indice}>
            <select
              aria-label={`Material do item ${indice + 1}`}
              value={item.material_id}
              onChange={(e) => alterarItem(indice, 'material_id', e.target.value)}
            >
              <option value="">Selecione…</option>
              {apenasAtivos(materiais, item.material_id).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
            <input
              aria-label={`Quantidade do item ${indice + 1}`}
              type="number"
              min="1"
              value={item.quantidade}
              onChange={(e) => alterarItem(indice, 'quantidade', e.target.value)}
            />
            <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => removerItem(indice)}>Remover</button>
          </div>
        ))}
        <button type="button" className="btn btn--fantasma" onClick={adicionarItem}>+ Item da receita</button>
      </fieldset>
      <Aviso erro={erro} />
      <div><button className="btn btn--primario" disabled={enviando}>{rotuloBotao}</button></div>
    </form>
  );
}
