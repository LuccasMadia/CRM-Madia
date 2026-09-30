import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { useFormulario } from '../hooks/useFormulario.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Campo } from './Campo.jsx';
import { Aviso } from './Aviso.jsx';
import { CATEGORIAS_QR, ROTULO_CATEGORIA_QR, STATUS_QR, ROTULO_STATUS_QR } from '../lib/rotulos.js';

export function FormQRCode({ inicial = {}, rotuloBotao = 'Salvar', onSalvar }) {
  const { dados: clientes } = useCarregar(() => api('/clientes'), []);
  const editando = Boolean(inicial.id);
  const { valores, campo } = useFormulario({
    cliente_id: inicial.cliente_id ? String(inicial.cliente_id) : '',
    novo_cliente_nome: '',
    nome: inicial.nome ?? '',
    categoria: inicial.categoria ?? CATEGORIAS_QR[0],
    descricao_local: inicial.descricao_local ?? '',
    status: inicial.status ?? 'ativo',
  });
  const { erros, erro, enviando, executar } = useEnvio();
  const clienteNovo = valores.cliente_id === 'novo';

  function enviar(e) {
    e.preventDefault();
    const corpo = { ...valores };
    delete corpo.novo_cliente_nome;
    if (clienteNovo) {
      delete corpo.cliente_id;
      corpo.novo_cliente = { nome: valores.novo_cliente_nome };
    } else {
      corpo.cliente_id = valores.cliente_id ? Number(valores.cliente_id) : null;
    }
    if (!editando) delete corpo.status;
    executar(() => onSalvar(corpo));
  }

  return (
    <form onSubmit={enviar} className="form" noValidate>
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
      <Campo rotulo="Nome" nome="nome" erros={erros} {...campo('nome')} />
      <Campo rotulo="Categoria" nome="categoria" erros={erros}>
        <select {...campo('categoria')}>
          {CATEGORIAS_QR.map((c) => <option key={c} value={c}>{ROTULO_CATEGORIA_QR[c]}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Local de aplicação" nome="descricao_local" erros={erros}>
        <textarea rows={2} {...campo('descricao_local')} />
      </Campo>
      {editando && (
        <Campo rotulo="Status" nome="status" erros={erros}>
          <select {...campo('status')}>
            {STATUS_QR.map((s) => <option key={s} value={s}>{ROTULO_STATUS_QR[s]}</option>)}
          </select>
        </Campo>
      )}
      <Aviso erro={erro} />
      <div><button className="btn btn--primario" disabled={enviando}>{rotuloBotao}</button></div>
    </form>
  );
}
