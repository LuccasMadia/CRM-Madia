import { useState } from 'react';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { useFormulario } from '../hooks/useFormulario.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Campo } from './Campo.jsx';
import { Aviso } from './Aviso.jsx';
import { MidiasConteudo } from './MidiasConteudo.jsx';
import { PublicarConteudo } from './PublicarConteudo.jsx';
import { ROTULO_ESTADO_CONTEUDO, ROTULO_TIPO } from '../lib/rotulos.js';
import { CLASSE_ESTADO_CONTEUDO as CLASSE_ESTADO } from '../lib/conteudos.js';

const ESTADOS_EDITAVEIS = { rascunho: ROTULO_ESTADO_CONTEUDO.rascunho, pronto: ROTULO_ESTADO_CONTEUDO.pronto };

const VAZIO = { titulo: '', tipo: 'post', estado: 'rascunho', data_planejada: '', legenda: '', projeto_id: '' };

const opcoes = (rotulos) => Object.entries(rotulos).map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>);

export function FormConteudo({ inicial = {}, projetoFixo, onSalvar, onExcluir, onMidiasMudaram }) {
  const { dados: projetos } = useCarregar(() => (projetoFixo ? Promise.resolve([]) : api('/projetos')), [projetoFixo]);
  const { valores, campo } = useFormulario(
    Object.fromEntries(Object.entries(VAZIO).map(([k, padrao]) => [k, inicial[k] == null ? padrao : String(inicial[k])])),
  );
  const { erros, erro, enviando, executar } = useEnvio();
  const [atual, setAtual] = useState(inicial);

  const emPublicacao = Boolean(atual.id) && !ESTADOS_EDITAVEIS[atual.estado];
  const conteudoMudou = (c) => { setAtual(c); onMidiasMudaram?.(c); };

  function enviar(e) {
    e.preventDefault();
    const { projeto_id: projetoEscolhido, ...resto } = valores;
    // Estados de publicação só mudam pelas ações de publicar/agendar; o select nem aparece neles.
    if (emPublicacao) delete resto.estado;
    else if (!ESTADOS_EDITAVEIS[resto.estado]) resto.estado = atual.estado;
    const projeto_id = projetoFixo ?? (projetoEscolhido ? Number(projetoEscolhido) : null);
    executar(() => onSalvar({ ...resto, projeto_id }));
  }

  return (
    <form onSubmit={enviar} className="form" noValidate>
      <Campo rotulo="Título" nome="titulo" erros={erros} {...campo('titulo')} />
      <Campo rotulo="Tipo" nome="tipo" erros={erros}><select {...campo('tipo')}>{opcoes(ROTULO_TIPO)}</select></Campo>
      {emPublicacao
        ? <p className="campo"><span>Estado: </span><span className={`etiqueta etiqueta--${CLASSE_ESTADO[atual.estado]}`}>{ROTULO_ESTADO_CONTEUDO[atual.estado]}</span></p>
        : <Campo rotulo="Estado" nome="estado" erros={erros}><select {...campo('estado')}>{opcoes(ESTADOS_EDITAVEIS)}</select></Campo>}
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
      {atual.id
        ? (
          <>
            <MidiasConteudo conteudo={atual} onMudou={conteudoMudou} />
            <PublicarConteudo conteudo={atual} onMudou={conteudoMudou} />
          </>
        )
        : <p className="kanban__meta">Salve o rascunho para adicionar mídias.</p>}
      <Aviso erro={erro} />
      <div className="form--linha">
        <button className="btn btn--primario" disabled={enviando}>Salvar</button>
        {onExcluir && <button type="button" className="btn btn--perigo" onClick={() => executar(onExcluir)}>Excluir</button>}
      </div>
    </form>
  );
}
