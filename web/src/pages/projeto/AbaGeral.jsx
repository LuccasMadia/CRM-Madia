import { useNavigate } from 'react-router';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useFormulario } from '../../hooks/useFormulario.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { Campo } from '../../components/Campo.jsx';
import { Aviso } from '../../components/Aviso.jsx';
import { centavosParaTexto, paraCentavos } from '../../lib/dinheiro.js';
import { ETAPAS, ROTULO_ETAPA } from '../../lib/rotulos.js';

export function AbaGeral({ projeto, onSalvo }) {
  const navegar = useNavigate();
  const { dados: clientes } = useCarregar(() => api('/clientes'), []);
  const { valores, campo, setValores } = useFormulario({
    titulo: projeto.titulo,
    cliente_id: String(projeto.cliente_id),
    etapa: projeto.etapa,
    valor: centavosParaTexto(projeto.valor_total_centavos),
    data_inicio: projeto.data_inicio ?? '',
    prazo_entrega: projeto.prazo_entrega ?? '',
    data_entrega: projeto.data_entrega ?? '',
    descricao: projeto.descricao ?? '',
    notas: projeto.notas ?? '',
    mensalidade_ativa: Boolean(projeto.mensalidade_ativa),
    mensalidade_valor: centavosParaTexto(projeto.mensalidade_valor_centavos),
    mensalidade_dia_vencimento: projeto.mensalidade_dia_vencimento ? String(projeto.mensalidade_dia_vencimento) : '',
    postou_instagram: Boolean(projeto.postou_instagram),
  });
  const { erros, erro, enviando, executar, setErros } = useEnvio();

  function salvar(e) {
    e.preventDefault();
    const valorCentavos = paraCentavos(valores.valor);
    if (Number.isNaN(valorCentavos)) {
      setErros([{ campo: 'valor_total_centavos', mensagem: 'Valor inválido' }]);
      return;
    }
    const mensalidadeValorCentavos = valores.mensalidade_ativa ? paraCentavos(valores.mensalidade_valor) : 0;
    if (valores.mensalidade_ativa && (mensalidadeValorCentavos === null || Number.isNaN(mensalidadeValorCentavos))) {
      setErros([{ campo: 'mensalidade_valor_centavos', mensagem: 'Valor inválido' }]);
      return;
    }
    const { valor: _valor, mensalidade_valor: _mensalidadeValor, ...resto } = valores;
    executar(async () => {
      await api(`/projetos/${projeto.id}`, {
        method: 'PUT',
        body: {
          ...resto,
          cliente_id: Number(resto.cliente_id),
          valor_total_centavos: valorCentavos ?? 0,
          mensalidade_ativa: Boolean(valores.mensalidade_ativa),
          mensalidade_valor_centavos: mensalidadeValorCentavos ?? 0,
          mensalidade_dia_vencimento: valores.mensalidade_ativa && valores.mensalidade_dia_vencimento
            ? Number(valores.mensalidade_dia_vencimento)
            : null,
        },
      });
      onSalvo();
    });
  }

  function excluir() {
    if (!window.confirm(`Excluir o projeto "${projeto.titulo}"? Parcelas, tarefas e dados do portfólio também serão excluídos.`)) return;
    executar(async () => {
      await api(`/projetos/${projeto.id}`, { method: 'DELETE' });
      navegar('/funil');
    });
  }

  return (
    <form onSubmit={salvar} className="form" noValidate>
      <Campo rotulo="Título" nome="titulo" erros={erros} {...campo('titulo')} />
      <Campo rotulo="Cliente" nome="cliente_id" erros={erros}>
        <select {...campo('cliente_id')}>
          {(clientes ?? [{ id: projeto.cliente_id, nome: projeto.cliente_nome }]).map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>
      </Campo>
      <Campo rotulo="Etapa" nome="etapa" erros={erros}>
        <select {...campo('etapa')}>
          {ETAPAS.map((e) => <option key={e} value={e}>{ROTULO_ETAPA[e]}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Valor (R$)" nome="valor_total_centavos" erros={erros} inputMode="decimal" {...campo('valor')} />
      <Campo rotulo="Início" nome="data_inicio" erros={erros} type="date" {...campo('data_inicio')} />
      <Campo rotulo="Prazo de entrega" nome="prazo_entrega" erros={erros} type="date" {...campo('prazo_entrega')} />
      <Campo rotulo="Data de entrega" nome="data_entrega" erros={erros} type="date" {...campo('data_entrega')} />
      <Campo rotulo="Descrição (interna)" nome="descricao" erros={erros}>
        <textarea rows={3} {...campo('descricao')} />
      </Campo>
      <Campo rotulo="Notas" nome="notas" erros={erros}>
        <textarea rows={4} {...campo('notas')} />
      </Campo>
      <div className="campo">
        <label>
          <input
            type="checkbox"
            checked={Boolean(valores.mensalidade_ativa)}
            onChange={(e) => setValores((v) => ({ ...v, mensalidade_ativa: e.target.checked }))}
          />{' '}
          Cobra mensalidade
        </label>
      </div>
      {valores.mensalidade_ativa && (
        <>
          <Campo rotulo="Valor da mensalidade (R$)" nome="mensalidade_valor_centavos" erros={erros} inputMode="decimal" {...campo('mensalidade_valor')} />
          <Campo rotulo="Dia de vencimento" nome="mensalidade_dia_vencimento" erros={erros} type="number" min="1" max="31" {...campo('mensalidade_dia_vencimento')} />
        </>
      )}
      <div className="campo">
        <label>
          <input
            type="checkbox"
            checked={Boolean(valores.postou_instagram)}
            onChange={(e) => setValores((v) => ({ ...v, postou_instagram: e.target.checked }))}
          />{' '}
          Postou no Instagram
        </label>
      </div>
      <Aviso erro={erro} />
      <div className="form--linha">
        <button className="btn btn--primario" disabled={enviando}>Salvar projeto</button>
        <button type="button" className="btn btn--perigo" onClick={excluir}>Excluir projeto</button>
      </div>
    </form>
  );
}
