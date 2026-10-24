import { useState } from 'react';
import { useFormulario } from '../hooks/useFormulario.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Campo } from './Campo.jsx';
import { Aviso } from './Aviso.jsx';
import { paraCentavos, centavosParaTexto } from '../lib/dinheiro.js';
import { CaixaModeloTarefas, modeloPadrao, useModelosTarefas } from './tarefas/ModeloTarefas.jsx';

// Com `clientes` (lista de Serviços), o formulário também pergunta de quem é; no perfil vem o clienteId.
export function FormGmn({ clienteId, clientes = null, projeto = null, parcela = null, onSalvar }) {
  const mensal = Boolean(projeto?.mensalidade_ativa);
  const { valores, campo, setValores } = useFormulario({
    cliente_id: clienteId ? String(clienteId) : '',
    cobranca: mensal ? 'mensal' : 'unica',
    valor: projeto ? centavosParaTexto(mensal ? projeto.mensalidade_valor_centavos : projeto.valor_total_centavos) : '',
    vencimento: parcela?.vencimento ?? '',
    dia: projeto?.mensalidade_dia_vencimento ? String(projeto.mensalidade_dia_vencimento) : '',
    link_perfil: projeto?.link_perfil ?? '',
    notas: projeto?.notas ?? '',
  });
  const { erros, erro, enviando, executar, setErros } = useEnvio();
  const valorTravado = Boolean(parcela?.pago_em) && valores.cobranca === 'unica';
  // Só ao criar: o GMN novo já nasce com as tarefas do modelo (dá para desmarcar).
  const modeloGmn = modeloPadrao(useModelosTarefas(), 'google_meu_negocio');
  const [criarTarefas, setCriarTarefas] = useState(true);

  function enviar(e) {
    e.preventDefault();
    const valor = paraCentavos(valores.valor);
    if (!valores.cliente_id) {
      setErros([{ campo: 'cliente_id', mensagem: 'Escolha o cliente' }]);
      return;
    }
    if (Number.isNaN(valor)) {
      setErros([{ campo: 'valor', mensagem: 'Valor inválido' }]);
      return;
    }
    const corpo = projeto ? {} : { servico: 'google_meu_negocio', titulo: 'Google Meu Negócio', cliente_id: Number(valores.cliente_id) };
    if (valores.cobranca === 'mensal') {
      Object.assign(corpo, {
        valor_total_centavos: 0, mensalidade_ativa: true,
        mensalidade_valor_centavos: valor ?? 0, mensalidade_dia_vencimento: Number(valores.dia) || null,
      });
    } else {
      Object.assign(corpo, { valor_total_centavos: valor ?? 0, vencimento: valores.vencimento, mensalidade_ativa: false });
    }
    Object.assign(corpo, { link_perfil: valores.link_perfil, notas: valores.notas });
    if (!projeto && modeloGmn && criarTarefas) corpo.modelo_tarefas_id = modeloGmn.id;
    executar(() => onSalvar(corpo));
  }

  return (
    <form onSubmit={enviar} className="form" noValidate>
      {clientes && (
        <Campo rotulo="Cliente" nome="cliente_id" erros={erros}>
          <select {...campo('cliente_id')}>
            <option value="">Escolha…</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome || c.responsavel}</option>)}
          </select>
        </Campo>
      )}
      <fieldset className="campo">
        <legend>Cobrança</legend>
        <label>
          <input type="radio" name="cobranca" value="unica" checked={valores.cobranca === 'unica'} onChange={() => setValores((v) => ({ ...v, cobranca: 'unica' }))} /> Única
        </label>{' '}
        <label>
          <input type="radio" name="cobranca" value="mensal" checked={valores.cobranca === 'mensal'} onChange={() => setValores((v) => ({ ...v, cobranca: 'mensal' }))} /> Mensalidade
        </label>
      </fieldset>
      <Campo rotulo="Valor (R$)" nome="valor" erros={erros} inputMode="decimal" placeholder="0,00" disabled={valorTravado} {...campo('valor')} />
      {valorTravado && <p className="vazio">Já pago — o valor não muda mais.</p>}
      {valores.cobranca === 'unica'
        ? <Campo rotulo="Vencimento" nome="vencimento" erros={erros} type="date" {...campo('vencimento')} />
        : <Campo rotulo="Dia do vencimento" nome="mensalidade_dia_vencimento" erros={erros} type="number" min="1" max="31" {...campo('dia')} />}
      <Campo rotulo="Link do perfil" nome="link_perfil" erros={erros} {...campo('link_perfil')} />
      <Campo rotulo="Observações" nome="notas" erros={erros}>
        <textarea rows={3} {...campo('notas')} />
      </Campo>
      {!projeto && <CaixaModeloTarefas modelo={modeloGmn} marcado={criarTarefas} onMudar={setCriarTarefas} />}
      <Aviso erro={erro} />
      <div><button className="btn btn--primario" disabled={enviando}>Salvar</button></div>
    </form>
  );
}
