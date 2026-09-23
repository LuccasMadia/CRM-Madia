import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { useFormulario } from '../hooks/useFormulario.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Campo } from './Campo.jsx';
import { Aviso } from './Aviso.jsx';
import { paraCentavos } from '../lib/dinheiro.js';
import { ETAPAS, ROTULO_ETAPA } from '../lib/rotulos.js';

export function FormOportunidade({ onSalvar }) {
  const { dados: clientes } = useCarregar(() => api('/clientes'), []);
  const { valores, campo } = useFormulario({
    titulo: '', cliente_id: '', novo_cliente_nome: '', valor: '', prazo_entrega: '', etapa: 'contato',
  });
  const { erros, erro, enviando, executar, setErros } = useEnvio();
  const clienteNovo = valores.cliente_id === 'novo';

  function enviar(e) {
    e.preventDefault();
    const valor = paraCentavos(valores.valor);
    if (Number.isNaN(valor)) {
      setErros([{ campo: 'valor_total_centavos', mensagem: 'Valor inválido' }]);
      return;
    }
    const corpo = { titulo: valores.titulo, etapa: valores.etapa, valor_total_centavos: valor ?? 0, prazo_entrega: valores.prazo_entrega };
    if (clienteNovo) corpo.novo_cliente = { nome: valores.novo_cliente_nome };
    else corpo.cliente_id = valores.cliente_id ? Number(valores.cliente_id) : null;
    executar(() => onSalvar(corpo));
  }

  return (
    <form onSubmit={enviar} className="form" noValidate>
      <Campo rotulo="Título" nome="titulo" erros={erros} {...campo('titulo')} />
      <Campo rotulo="Cliente" nome="cliente_id" erros={erros}>
        <select {...campo('cliente_id')}>
          <option value="">Selecione…</option>
          {(clientes ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          <option value="novo">+ Novo cliente</option>
        </select>
      </Campo>
      {clienteNovo && (
        <Campo rotulo="Nome do novo cliente" nome="novo_cliente.nome" erros={erros} {...campo('novo_cliente_nome')} />
      )}
      <Campo rotulo="Etapa" nome="etapa" erros={erros}>
        <select {...campo('etapa')}>
          {ETAPAS.map((e) => <option key={e} value={e}>{ROTULO_ETAPA[e]}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Valor (R$)" nome="valor_total_centavos" erros={erros} inputMode="decimal" placeholder="0,00" {...campo('valor')} />
      <Campo rotulo="Prazo de entrega" nome="prazo_entrega" erros={erros} type="date" {...campo('prazo_entrega')} />
      <Aviso erro={erro} />
      <div><button className="btn btn--primario" disabled={enviando}>Criar oportunidade</button></div>
    </form>
  );
}
