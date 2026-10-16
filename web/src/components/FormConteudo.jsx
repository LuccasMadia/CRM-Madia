import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { useFormulario } from '../hooks/useFormulario.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Campo } from './Campo.jsx';
import { Aviso } from './Aviso.jsx';
import { ROTULO_ESTADO_CONTEUDO, ROTULO_TIPO } from '../lib/rotulos.js';

const VAZIO = { titulo: '', tipo: 'post', estado: 'rascunho', data_planejada: '', legenda: '', projeto_id: '' };

const opcoes = (rotulos) => Object.entries(rotulos).map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>);

export function FormConteudo({ inicial = {}, projetoFixo, onSalvar, onExcluir }) {
  const { dados: projetos } = useCarregar(() => (projetoFixo ? Promise.resolve([]) : api('/projetos')), [projetoFixo]);
  const { valores, campo } = useFormulario(
    Object.fromEntries(Object.entries(VAZIO).map(([k, padrao]) => [k, inicial[k] == null ? padrao : String(inicial[k])])),
  );
  const { erros, erro, enviando, executar } = useEnvio();
  const [arte, setArte] = useState(null);
  const [removerArte, setRemoverArte] = useState(false);
  const [previa, setPrevia] = useState(null);

  useEffect(() => {
    if (!arte) {
      setPrevia(null);
      return undefined;
    }
    let url;
    try {
      url = URL.createObjectURL(arte);
    } catch {
      return undefined; // sem prévia (ambiente sem suporte a blob URL)
    }
    setPrevia(url);
    return () => URL.revokeObjectURL(url);
  }, [arte]);

  const arteAtual = previa ?? (inicial.arte && !removerArte ? `/uploads/${inicial.arte}` : null);

  function enviar(e) {
    e.preventDefault();
    const { projeto_id: projetoEscolhido, ...resto } = valores;
    const projeto_id = projetoFixo ?? (projetoEscolhido ? Number(projetoEscolhido) : null);
    executar(() => onSalvar({ ...resto, projeto_id }, { arte, removerArte: !arte && removerArte }));
  }

  function tirarArte() {
    setArte(null);
    setRemoverArte(true);
  }

  return (
    <form onSubmit={enviar} className="form" noValidate>
      <Campo rotulo="Título" nome="titulo" erros={erros} {...campo('titulo')} />
      <Campo rotulo="Tipo" nome="tipo" erros={erros}><select {...campo('tipo')}>{opcoes(ROTULO_TIPO)}</select></Campo>
      <Campo rotulo="Estado" nome="estado" erros={erros}><select {...campo('estado')}>{opcoes(ROTULO_ESTADO_CONTEUDO)}</select></Campo>
      {!projetoFixo && (
        <Campo rotulo="Projeto (opcional)" nome="projeto_id" erros={erros}>
          <select {...campo('projeto_id')}>
            <option value="">Nenhum</option>
            {(projetos ?? []).map((p) => <option key={p.id} value={p.id}>{p.titulo}</option>)}
          </select>
        </Campo>
      )}
      <Campo rotulo="Data planejada (opcional)" nome="data_planejada" erros={erros} type="date" {...campo('data_planejada')} />
      <Campo rotulo="Legenda" nome="legenda" erros={erros}><textarea rows={5} {...campo('legenda')} /></Campo>
      <div className="campo">
        <label htmlFor="campo-arte">Arte</label>
        {arteAtual && <img className="form-conteudo__arte" src={arteAtual} alt="Arte atual" />}
        <input
          id="campo-arte"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => setArte(e.target.files?.[0] ?? null)}
        />
        {arteAtual && <button type="button" className="btn" onClick={tirarArte}>Remover arte</button>}
      </div>
      <Aviso erro={erro} />
      <div className="form--linha">
        <button className="btn btn--primario" disabled={enviando}>Salvar</button>
        {onExcluir && <button type="button" className="btn btn--perigo" onClick={() => executar(onExcluir)}>Excluir</button>}
      </div>
    </form>
  );
}
