import { useState } from 'react';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { useFormulario } from '../hooks/useFormulario.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Campo } from './Campo.jsx';
import { Aviso } from './Aviso.jsx';
import { paraCentavos, centavosParaTexto, formatarDinheiro } from '../lib/dinheiro.js';
import { apenasAtivos } from '../lib/ativos.js';
import { precosPorPosicao } from '../../../server/domain/placas.js';

export function FormPlacaModelo({ inicial = {}, rotuloBotao = 'Salvar', onSalvar }) {
  const { dados: materiais } = useCarregar(() => api('/placas/materiais'), []);
  const { valores, campo } = useFormulario({
    nome: inicial.nome ?? '',
    preco_venda: centavosParaTexto(inicial.preco_venda_centavos),
  });
  const [itens, setItens] = useState(
    (inicial.itens ?? []).map((i) => ({ material_id: String(i.material_id), quantidade: String(i.quantidade) })),
  );
  const [packs, setPacks] = useState(
    (inicial.packs ?? []).map((p) => ({ quantidade: String(p.quantidade), preco: centavosParaTexto(p.preco_total_centavos) })),
  );

  function alterarPack(indice, campoPack, valor) {
    setPacks((atual) => atual.map((p, i) => (i === indice ? { ...p, [campoPack]: valor } : p)));
  }

  const precoVendaCentavos = paraCentavos(valores.preco_venda);
  const packsValidos = packs
    .map((p) => ({ quantidade: Number(p.quantidade), preco_total_centavos: paraCentavos(p.preco) }))
    .filter((p) => Number.isInteger(p.quantidade) && p.quantidade >= 2 && Number.isInteger(p.preco_total_centavos));
  const temPrevia = Number.isInteger(precoVendaCentavos) && packsValidos.length > 0;
  const degraus = temPrevia ? precosPorPosicao({ preco_venda_centavos: precoVendaCentavos }, packsValidos) : [];
  const previa = degraus
    .map((d, i) => `${i + 1}ª${i === degraus.length - 1 ? ' em diante' : ''}: ${formatarDinheiro(d)}`)
    .join(' · ');
  const tabela = temPrevia
    ? [{ quantidade: 1, preco_total_centavos: precoVendaCentavos }, ...packsValidos].sort((a, b) => a.quantidade - b.quantidade)
    : [];
  const avisosPacks = tabela.slice(1)
    .filter((p, k) => p.preco_total_centavos / p.quantidade > tabela[k].preco_total_centavos / tabela[k].quantidade)
    .map((p) => {
      const anterior = tabela[tabela.indexOf(p) - 1];
      return `O pack de ${p.quantidade} sai mais caro por placa que o pack de ${anterior.quantidade}.`;
    });
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
    const packsSaida = packs.map((p) => ({ quantidade: Number(p.quantidade), preco_total_centavos: paraCentavos(p.preco) }));
    if (packsSaida.some((p) => p.preco_total_centavos === null || Number.isNaN(p.preco_total_centavos))) {
      setErros([{ campo: 'packs', mensagem: 'Valor de pack inválido' }]);
      return;
    }
    executar(() => onSalvar({
      nome: valores.nome,
      preco_venda_centavos: precoVenda,
      itens: itens.map((i) => ({ material_id: Number(i.material_id), quantidade: Number(i.quantidade) })),
      packs: packsSaida,
    }));
  }

  return (
    <form onSubmit={enviar} className="form" noValidate>
      <Campo rotulo="Nome" nome="nome" erros={erros} {...campo('nome')} />
      <Campo rotulo="Preço de venda (R$)" nome="preco_venda_centavos" erros={erros} inputMode="decimal" {...campo('preco_venda')} />
      <fieldset>
        <legend>Packs</legend>
        {packs.map((pack, indice) => (
          <div className="form--linha" key={indice}>
            <input
              aria-label={`Quantidade do pack ${indice + 1}`}
              type="number"
              min="2"
              value={pack.quantidade}
              onChange={(e) => alterarPack(indice, 'quantidade', e.target.value)}
            />
            <input
              aria-label={`Preço do pack ${indice + 1}`}
              inputMode="decimal"
              placeholder="Preço total (R$)"
              value={pack.preco}
              onChange={(e) => alterarPack(indice, 'preco', e.target.value)}
            />
            <button type="button" className="btn btn--fantasma btn--pequeno" aria-label="Remover pack" onClick={() => setPacks((atual) => atual.filter((_, i) => i !== indice))}>Remover</button>
          </div>
        ))}
        <button type="button" className="btn btn--fantasma" onClick={() => setPacks((atual) => [...atual, { quantidade: String(atual.length + 2), preco: '' }])}>+ Pack</button>
        {previa && <p className="form__ajuda">{previa}</p>}
        {avisosPacks.map((a) => <p key={a} className="form__ajuda form__ajuda--aviso">{a}</p>)}
        {erros.some((e) => e.campo === 'packs') && <p className="form__ajuda form__ajuda--aviso">Valor de pack inválido</p>}
      </fieldset>
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
