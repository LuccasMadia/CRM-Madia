import { useFormulario } from '../hooks/useFormulario.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Campo } from './Campo.jsx';
import { Aviso } from './Aviso.jsx';

export function FormPlacaMaterial({ inicial = {}, rotuloBotao = 'Salvar', onSalvar }) {
  const { valores, campo } = useFormulario({ nome: inicial.nome ?? '' });
  const { erros, erro, enviando, executar } = useEnvio();

  function enviar(e) {
    e.preventDefault();
    executar(() => onSalvar({ nome: valores.nome }));
  }

  return (
    <form onSubmit={enviar} className="form" noValidate>
      <Campo rotulo="Nome" nome="nome" erros={erros} {...campo('nome')} />
      <Aviso erro={erro} />
      <div><button className="btn btn--primario" disabled={enviando}>{rotuloBotao}</button></div>
    </form>
  );
}
