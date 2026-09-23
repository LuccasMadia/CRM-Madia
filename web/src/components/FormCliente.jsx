import { useFormulario } from '../hooks/useFormulario.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Campo } from './Campo.jsx';
import { Aviso } from './Aviso.jsx';

const VAZIO = { nome: '', empresa: '', email: '', telefone: '', instagram: '', origem: '', notas: '' };
const ORIGENS = ['Indicação', 'Instagram', 'Site', 'Outro'];

export function FormCliente({ inicial = {}, rotuloBotao = 'Salvar', onSalvar }) {
  const { valores, campo } = useFormulario(
    Object.fromEntries(Object.keys(VAZIO).map((k) => [k, inicial[k] ?? ''])),
  );
  const { erros, erro, enviando, executar } = useEnvio();

  function enviar(e) {
    e.preventDefault();
    executar(() => onSalvar(valores));
  }

  return (
    <form onSubmit={enviar} className="form" noValidate>
      <Campo rotulo="Nome" nome="nome" erros={erros} {...campo('nome')} />
      <Campo rotulo="Empresa" nome="empresa" erros={erros} {...campo('empresa')} />
      <Campo rotulo="Email" nome="email" erros={erros} type="email" {...campo('email')} />
      <Campo rotulo="Telefone / WhatsApp" nome="telefone" erros={erros} {...campo('telefone')} />
      <Campo rotulo="Instagram" nome="instagram" erros={erros} {...campo('instagram')} />
      <Campo rotulo="Origem" nome="origem" erros={erros} list="origens" {...campo('origem')} />
      <datalist id="origens">{ORIGENS.map((o) => <option key={o} value={o} />)}</datalist>
      <Campo rotulo="Notas" nome="notas" erros={erros}>
        <textarea rows={4} {...campo('notas')} />
      </Campo>
      <Aviso erro={erro} />
      <div><button className="btn btn--primario" disabled={enviando}>{rotuloBotao}</button></div>
    </form>
  );
}
