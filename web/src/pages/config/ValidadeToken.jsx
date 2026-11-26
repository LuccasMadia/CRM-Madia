import { useState } from 'react';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { formatarData } from '../../lib/datas.js';

const dias = (n) => `${n} ${n === 1 ? 'dia' : 'dias'}`;

function situacao(c) {
  if (c.falhou) return { texto: `Parou de funcionar: ${c.mensagem}`, tom: 'erro' };
  if (c.validade_estado === 'venceu') return { texto: `Venceu há ${dias(c.dias)}`, tom: 'erro' };
  if (c.validade_estado === 'vence') return { texto: c.dias === 0 ? 'Vence hoje' : `Vence em ${dias(c.dias)}`, tom: 'atencao' };
  if (c.validade_estado === 'ok') return { texto: `Válido até ${formatarData(c.validade)}`, tom: 'ok' };
  return null;
}

// Situação do token (funcionando? quando vence?) e a data de validade que o Lucca informa para ser avisado.
// Some se o serviço não está conectado. Vários cartões do mesmo serviço (contas do Supabase) usam contaId.
export function ValidadeToken({ servico, contaId }) {
  const carregado = useCarregar(() => api('/conexoes'), []);
  const [lista, setLista] = useState(null);
  const [data, setData] = useState('');
  const { erros, erro, enviando, executar } = useEnvio();
  const item = (lista ?? carregado.dados ?? []).find((c) => c.servico === servico && (contaId == null || c.conta_id === contaId));
  if (!item) return null;

  const atual = situacao(item);
  const corpo = (validade) => ({ servico, ...(contaId == null ? {} : { conta_id: contaId }), validade });
  const gravar = (validade) => executar(async () => {
    setLista(await api('/conexoes/validade', { method: 'PUT', body: corpo(validade) }));
    setData('');
  });
  const mensagemErro = erros[0]?.mensagem ?? erro?.message;
  const campo = `validade-${servico}-${contaId ?? 'unico'}`;

  return (
    <div className="validade">
      {atual && <p className={`validade__situacao validade__situacao--${atual.tom}`}>{atual.texto}</p>}
      {item.editavel && (
        <div className="form--linha">
          <label htmlFor={campo}>Vence em</label>
          <input id={campo} type="date" value={data} onChange={(e) => setData(e.target.value)} />
          <button type="button" className="btn" disabled={enviando || !data} onClick={() => gravar(data)}>Salvar validade</button>
          {item.validade && <button type="button" className="btn" disabled={enviando} onClick={() => gravar('')}>Limpar validade</button>}
        </div>
      )}
      {mensagemErro && <p className="aviso aviso--erro" role="alert">{mensagemErro}</p>}
    </div>
  );
}
