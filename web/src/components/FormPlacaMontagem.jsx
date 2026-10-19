import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { useFormulario } from '../hooks/useFormulario.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Campo } from './Campo.jsx';
import { Aviso } from './Aviso.jsx';
import { hojeISO } from '../lib/datas.js';
import { apenasAtivos } from '../lib/ativos.js';

const paraLinhas = (itens = []) => itens.map((i) => ({ material_id: String(i.material_id), quantidade: String(i.quantidade) }));
const paraEnvio = (linhas) => linhas.map((i) => ({ material_id: Number(i.material_id), quantidade: Number(i.quantidade) }));
const chave = (itens) => JSON.stringify(itens.map((i) => [i.material_id, i.quantidade]));

export function FormPlacaMontagem({ onSalvar }) {
  const { dados: modelos } = useCarregar(() => api('/placas/modelos'), []);
  const { dados: materiais } = useCarregar(() => api('/placas/materiais'), []);
  const { valores, campo, setValores } = useFormulario({ modelo_id: '', quantidade: '1', data_montagem: hojeISO() });
  const { erros, erro, enviando, executar } = useEnvio();
  const [itens, setItens] = useState([]);
  const [perguntando, setPerguntando] = useState(false);
  const ativos = apenasAtivos(modelos ?? [], valores.modelo_id);
  const receita = ativos.find((m) => String(m.id) === valores.modelo_id)?.itens ?? [];

  useEffect(() => {
    if (!valores.modelo_id && ativos.length) {
      const inicial = ativos.find((m) => m.itens?.length) ?? ativos[0];
      setValores((v) => ({ ...v, modelo_id: String(inicial.id) }));
    }
  }, [ativos, valores.modelo_id, setValores]);

  // Cada modelo começa com os materiais da própria receita.
  const receitaDoModelo = modelos?.find((m) => String(m.id) === valores.modelo_id)?.itens;
  useEffect(() => {
    setItens(paraLinhas(receitaDoModelo));
    setPerguntando(false);
  }, [valores.modelo_id, receitaDoModelo]);

  function alterarItem(indice, campoItem, valor) {
    setItens((atual) => atual.map((item, i) => (i === indice ? { ...item, [campoItem]: valor } : item)));
    setPerguntando(false);
  }

  function registrar(itensEnviados, atualizarReceita) {
    executar(() => onSalvar({
      modelo_id: valores.modelo_id ? Number(valores.modelo_id) : null,
      quantidade: Number(valores.quantidade) || null,
      data_montagem: valores.data_montagem,
      ...(itensEnviados && { itens: itensEnviados, atualizar_receita: atualizarReceita }),
    }));
  }

  function enviar(e) {
    e.preventDefault();
    const editados = paraEnvio(itens);
    if (chave(editados) === chave(receita)) registrar(null);
    else setPerguntando(true);
  }

  return (
    <form onSubmit={enviar} className="form" noValidate>
      <Campo rotulo="Modelo" nome="modelo_id" erros={erros}>
        <select {...campo('modelo_id')}>
          <option value="">Selecione…</option>
          {ativos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Quantidade" nome="quantidade" erros={erros} type="number" min="1" {...campo('quantidade')} />
      <Campo rotulo="Data da montagem" nome="data_montagem" erros={erros} type="date" {...campo('data_montagem')} />
      <fieldset>
        <legend>Materiais usados (por placa)</legend>
        {valores.modelo_id && !receita.length && !itens.length && (
          <p className="vazio">Este modelo ainda não tem receita. Adicione os materiais usados.</p>
        )}
        {itens.map((item, indice) => (
          <div className="form--linha" key={indice}>
            <select
              aria-label={`Material ${indice + 1}`}
              value={item.material_id}
              onChange={(e) => alterarItem(indice, 'material_id', e.target.value)}
            >
              <option value="">Selecione…</option>
              {apenasAtivos(materiais ?? [], item.material_id).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
            <input
              aria-label={`Quantidade por placa ${indice + 1}`}
              type="number"
              min="1"
              value={item.quantidade}
              onChange={(e) => alterarItem(indice, 'quantidade', e.target.value)}
            />
            <button
              type="button"
              className="btn btn--fantasma btn--pequeno"
              onClick={() => { setItens((atual) => atual.filter((_, i) => i !== indice)); setPerguntando(false); }}
            >Remover</button>
          </div>
        ))}
        <button
          type="button"
          className="btn btn--fantasma"
          onClick={() => { setItens((atual) => [...atual, { material_id: '', quantidade: '1' }]); setPerguntando(false); }}
        >+ Material</button>
        <p className="form__ajuda">Esses materiais saem do estoque solto.</p>
      </fieldset>
      <Aviso erro={erro} />
      {perguntando ? (
        <div className="aviso" role="group" aria-label="Aplicar mudança nos materiais">
          <p>Você mudou os materiais. Isso vale só para esta montagem ou muda a receita do modelo?</p>
          <p>
            <button type="button" className="btn btn--primario" disabled={enviando} onClick={() => registrar(paraEnvio(itens), false)}>Só nesta montagem</button>{' '}
            <button type="button" className="btn" disabled={enviando} onClick={() => registrar(paraEnvio(itens), true)}>Mudar a receita do modelo</button>{' '}
            <button type="button" className="btn btn--fantasma" onClick={() => setPerguntando(false)}>Voltar</button>
          </p>
        </div>
      ) : (
        <div><button className="btn btn--primario" disabled={enviando}>Registrar montagem</button></div>
      )}
    </form>
  );
}
