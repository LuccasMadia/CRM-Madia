import { useState } from 'react';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { useFormulario } from '../hooks/useFormulario.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Campo } from './Campo.jsx';
import { Aviso } from './Aviso.jsx';
import { apenasAtivos } from '../lib/ativos.js';
import { hojeISO } from '../lib/datas.js';

export function FormPlacaAvaria({ inicial = {}, rotuloBotao = 'Salvar', onSalvar }) {
  const { dados: modelos } = useCarregar(() => api('/placas/modelos'), []);
  const { dados: materiais } = useCarregar(() => api('/placas/materiais'), []);
  const { valores, campo, setValores } = useFormulario({
    modelo_id: inicial.modelo_id ? String(inicial.modelo_id) : '',
    quantidade: String(inicial.quantidade ?? 1),
    observacao: inicial.observacao ?? '',
    data_avaria: inicial.data_avaria ?? hojeISO(),
  });
  const [itens, setItens] = useState(
    (inicial.itens ?? []).map((i) => ({ material_id: String(i.material_id), quantidade: String(i.quantidade) })),
  );
  const { erros, erro, enviando, executar } = useEnvio();

  function selecionarModelo(e) {
    const modeloId = e.target.value;
    const modelo = (modelos ?? []).find((m) => String(m.id) === modeloId);
    setValores((v) => ({ ...v, modelo_id: modeloId }));
    setItens((modelo?.itens ?? []).map((i) => ({ material_id: String(i.material_id), quantidade: String(i.quantidade) })));
  }

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
    executar(() => onSalvar({
      modelo_id: valores.modelo_id ? Number(valores.modelo_id) : null,
      quantidade: valores.quantidade ? Number(valores.quantidade) : 1,
      observacao: valores.observacao || null,
      data_avaria: valores.data_avaria,
      itens: itens.map((i) => ({ material_id: Number(i.material_id), quantidade: Number(i.quantidade) })),
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
      <fieldset>
        <legend>Materiais consumidos nesta avaria</legend>
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
      <Campo rotulo="Quantidade avariada" nome="quantidade" erros={erros} type="number" min="1" {...campo('quantidade')} />
      <Campo rotulo="Observação (opcional)" nome="observacao" erros={erros} {...campo('observacao')} />
      <Campo rotulo="Data" nome="data_avaria" erros={erros} type="date" {...campo('data_avaria')} />
      <Aviso erro={erro} />
      <div><button className="btn btn--primario" disabled={enviando}>{rotuloBotao}</button></div>
    </form>
  );
}
