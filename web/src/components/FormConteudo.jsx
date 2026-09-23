import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { useFormulario } from '../hooks/useFormulario.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Campo } from './Campo.jsx';
import { Aviso } from './Aviso.jsx';
import { ROTULO_CANAL, ROTULO_STATUS_CONTEUDO, ROTULO_TIPO } from '../lib/rotulos.js';

const VAZIO = {
  titulo: '', canal: 'instagram', tipo: 'post', status: 'ideia', data_planejada: '',
  data_publicada: '', link: '', legenda: '', projeto_id: '',
};

const opcoes = (rotulos) => Object.entries(rotulos).map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>);

export function FormConteudo({ inicial = {}, projetoFixo, onSalvar, onExcluir }) {
  const { dados: projetos } = useCarregar(() => (projetoFixo ? Promise.resolve([]) : api('/projetos')), [projetoFixo]);
  const { valores, campo } = useFormulario(
    Object.fromEntries(Object.entries(VAZIO).map(([k, padrao]) => [k, inicial[k] == null ? padrao : String(inicial[k])])),
  );
  const { erros, erro, enviando, executar } = useEnvio();

  function enviar(e) {
    e.preventDefault();
    const { projeto_id: projetoEscolhido, ...resto } = valores;
    const projeto_id = projetoFixo ?? (projetoEscolhido ? Number(projetoEscolhido) : null);
    executar(() => onSalvar({ ...resto, projeto_id }));
  }

  return (
    <form onSubmit={enviar} className="form" noValidate>
      <Campo rotulo="Título / ideia" nome="titulo" erros={erros} {...campo('titulo')} />
      <Campo rotulo="Canal" nome="canal" erros={erros}><select {...campo('canal')}>{opcoes(ROTULO_CANAL)}</select></Campo>
      <Campo rotulo="Tipo" nome="tipo" erros={erros}><select {...campo('tipo')}>{opcoes(ROTULO_TIPO)}</select></Campo>
      <Campo rotulo="Status" nome="status" erros={erros}><select {...campo('status')}>{opcoes(ROTULO_STATUS_CONTEUDO)}</select></Campo>
      {!projetoFixo && (
        <Campo rotulo="Projeto (opcional)" nome="projeto_id" erros={erros}>
          <select {...campo('projeto_id')}>
            <option value="">Nenhum</option>
            {(projetos ?? []).map((p) => <option key={p.id} value={p.id}>{p.titulo}</option>)}
          </select>
        </Campo>
      )}
      <Campo rotulo="Data planejada" nome="data_planejada" erros={erros} type="date" {...campo('data_planejada')} />
      <Campo rotulo="Data publicada" nome="data_publicada" erros={erros} type="date" {...campo('data_publicada')} />
      <Campo rotulo="Link do post" nome="link" erros={erros} type="url" {...campo('link')} />
      <Campo rotulo="Legenda" nome="legenda" erros={erros}><textarea rows={5} {...campo('legenda')} /></Campo>
      <Aviso erro={erro} />
      <div className="form--linha">
        <button className="btn btn--primario" disabled={enviando}>Salvar conteúdo</button>
        {onExcluir && <button type="button" className="btn btn--perigo" onClick={() => executar(onExcluir)}>Excluir</button>}
      </div>
    </form>
  );
}
