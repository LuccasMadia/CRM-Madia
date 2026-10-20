import { useEffect, useState } from 'react';
import { useFormulario } from '../hooks/useFormulario.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Campo } from './Campo.jsx';
import { Aviso } from './Aviso.jsx';
import { FotoCliente } from './FotoCliente.jsx';
import { arroba } from '../lib/instagram.js';

const VAZIO = {
  nome: '', responsavel: '', email: '', telefone: '', instagram: '', origem: '', notas: '',
};
const ORIGENS = ['Indicação', 'Instagram', 'Site', 'Outro'];

// onSalvar(dados, { foto, removerFoto }): a foto escolhida só é enviada quando o formulário é salvo.
// O Instagram já começa com "@": basta digitar o perfil.
export function FormCliente({ inicial = {}, rotuloBotao = 'Salvar', onSalvar }) {
  const { valores, campo } = useFormulario(
    { ...Object.fromEntries(Object.keys(VAZIO).map((k) => [k, inicial[k] ?? ''])), instagram: inicial.instagram || '@' },
  );
  const { erros, erro, enviando, executar } = useEnvio();
  const [foto, setFoto] = useState(null);
  const [removerFoto, setRemoverFoto] = useState(false);
  const [previa, setPrevia] = useState(null);

  useEffect(() => {
    if (!foto) {
      setPrevia(null);
      return undefined;
    }
    let url;
    try {
      url = URL.createObjectURL(foto);
    } catch {
      return undefined; // sem prévia (ambiente sem suporte a blob URL)
    }
    setPrevia(url);
    return () => URL.revokeObjectURL(url);
  }, [foto]);

  const fotoAtual = foto ? previa : (inicial.foto && !removerFoto ? inicial.foto : null);
  const temFoto = Boolean(foto || fotoAtual);

  function escolher(e) {
    const arquivo = e.target.files?.[0] ?? null;
    e.target.value = ''; // permite escolher o mesmo arquivo de novo
    if (!arquivo) return;
    setFoto(arquivo);
    setRemoverFoto(false);
  }

  function tirar() {
    setFoto(null);
    setRemoverFoto(true);
  }

  function enviar(e) {
    e.preventDefault();
    executar(() => onSalvar({ ...valores, instagram: arroba(valores.instagram) }, { foto, removerFoto: !foto && removerFoto && Boolean(inicial.foto) }));
  }

  return (
    <form onSubmit={enviar} className="form" noValidate>
      <div className="campo form-cliente__foto">
        {foto && previa
          ? <img className="foto-cliente" src={previa} alt="Prévia da foto" style={{ width: 64, height: 64 }} />
          : <FotoCliente cliente={{ ...valores, foto: fotoAtual }} tamanho={64} rotulo="Foto atual" />}
        <div className="form-cliente__foto-acoes">
          <label className="btn btn--pequeno">
            {temFoto ? 'Trocar foto' : 'Escolher foto'}
            <input type="file" accept="image/png,image/jpeg,image/webp" aria-label="Foto" className="form-cliente__arquivo" onChange={escolher} />
          </label>
          {temFoto && <button type="button" className="btn btn--fantasma btn--pequeno" onClick={tirar}>Remover foto</button>}
        </div>
      </div>
      <Campo rotulo="Empresa" nome="nome" erros={erros} {...campo('nome')} />
      <Campo rotulo="Responsável" nome="responsavel" erros={erros} {...campo('responsavel')} />
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
