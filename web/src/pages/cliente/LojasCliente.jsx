import { api } from '../../api/client.js';
import { useFormulario } from '../../hooks/useFormulario.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { useConfirmacao } from '../../hooks/useConfirmacao.jsx';
import { notificar } from '../../lib/notificacoes.js';
import { Campo } from '../../components/Campo.jsx';
import { Aviso } from '../../components/Aviso.jsx';
import { Modal } from '../../components/Modal.jsx';

function FormLoja({ inicial = {}, onSalvar }) {
  const { valores, campo } = useFormulario({ nome: inicial.nome ?? '', responsavel: inicial.responsavel ?? '' });
  const { erros, erro, enviando, executar, setErros } = useEnvio();

  function enviar(e) {
    e.preventDefault();
    if (!valores.nome.trim()) {
      setErros([{ campo: 'nome', mensagem: 'Informe o nome da loja' }]);
      return;
    }
    executar(() => onSalvar({ nome: valores.nome, responsavel: valores.responsavel }));
  }

  return (
    <form onSubmit={enviar} className="form" noValidate>
      <Campo rotulo="Nome da loja" nome="nome" erros={erros} {...campo('nome')} />
      <Campo rotulo="Responsável (opcional)" nome="responsavel" erros={erros} {...campo('responsavel')} />
      <Aviso erro={erro} />
      <div><button className="btn btn--primario" disabled={enviando}>Salvar</button></div>
    </form>
  );
}

// `editando`: null (fechado), 'nova' ou a loja sendo editada. Fica no pai porque o botão "Adicionar loja" mora no topo.
export function LojasCliente({ cliente, editando, setEditando, onMudou }) {
  const [confirmar, dialogo] = useConfirmacao();
  const base = `/clientes/${cliente.id}/lojas`;

  async function salvar(dados) {
    if (editando === 'nova') await api(base, { method: 'POST', body: dados });
    else await api(`${base}/${editando.id}`, { method: 'PUT', body: dados });
    setEditando(null);
    onMudou();
    notificar('Loja salva');
  }

  function remover(loja) {
    confirmar({
      titulo: `Remover a loja ${loja.nome}?`,
      mensagem: 'Os perfis do Google e as placas dessa loja continuam no cliente, só ficam sem loja.',
      rotuloConfirmar: 'Remover',
      onConfirmar: async () => {
        await api(`${base}/${loja.id}`, { method: 'DELETE' });
        onMudou();
        notificar('Loja removida');
      },
    });
  }

  return (
    <>
      {cliente.lojas.length > 0 && (
        <section className="cartao" aria-label="Lojas">
          <h2>Lojas</h2>
          <ul className="lista">
            {cliente.lojas.map((l) => (
              <li key={l.id}>
                <strong>{l.nome}</strong>
                {l.responsavel && <span className="vazio">{` · ${l.responsavel}`}</span>}{' '}
                <button type="button" className="btn btn--pequeno btn--fantasma" aria-label={`Editar ${l.nome}`} onClick={() => setEditando(l)}>Editar</button>{' '}
                <button type="button" className="btn btn--pequeno btn--perigo" aria-label={`Remover ${l.nome}`} onClick={() => remover(l)}>Remover</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {editando && (
        <Modal titulo={editando === 'nova' ? 'Adicionar loja' : 'Editar loja'} onFechar={() => setEditando(null)}>
          <FormLoja inicial={editando === 'nova' ? {} : editando} onSalvar={salvar} />
        </Modal>
      )}
      {dialogo}
    </>
  );
}
