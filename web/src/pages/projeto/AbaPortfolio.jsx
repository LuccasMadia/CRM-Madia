import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { useFormulario } from '../../hooks/useFormulario.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { Campo } from '../../components/Campo.jsx';
import { Aviso } from '../../components/Aviso.jsx';
import { gerarSlug } from '../../../../server/domain/slug.js';

const STATUS_SUGERIDOS = ['Em funcionamento', 'Em desenvolvimento'];

export function AbaPortfolio({ projeto }) {
  const [pf, setPf] = useState(null);
  const [erroCarga, setErroCarga] = useState(null);
  const envio = useEnvio();

  useEffect(() => {
    api(`/projetos/${projeto.id}/portfolio`).then(setPf, setErroCarga);
  }, [projeto.id]);

  if (erroCarga) return <Aviso erro={erroCarga} />;
  if (!pf) return <p>Carregando…</p>;

  const executar = (fn) => envio.executar(async () => setPf(await fn()));
  const base = `/projetos/${projeto.id}/portfolio`;

  return (
    <>
      <FormDadosPublicos
        key={pf.atualizado_em}
        pf={pf}
        projeto={projeto}
        onSalvar={async (dados) => setPf(await api(base, { method: 'PUT', body: dados }))}
      />
      <Aviso erro={envio.erro} />
      <Imagens pf={pf} base={base} executar={executar} />
      <CaseStudy pf={pf} base={base} executar={executar} />
    </>
  );
}

function FormDadosPublicos({ pf, projeto, onSalvar }) {
  const { valores, campo, setValores } = useFormulario({
    publicar: pf.publicar,
    slug: pf.slug ?? '',
    titulo_publico: pf.titulo_publico ?? '',
    descricao_publica: pf.descricao_publica ?? '',
    stack: pf.stack.join(', '),
    status_publico: pf.status_publico ?? '',
    live_url: pf.live_url ?? '',
    code_url: pf.code_url ?? '',
    ordem: String(pf.ordem),
  });
  const { erros, erro, enviando, executar, setErros } = useEnvio();

  function enviar(e) {
    e.preventDefault();
    const ordem = Number(valores.ordem);
    if (!Number.isInteger(ordem) || ordem < 0) {
      setErros([{ campo: 'ordem', mensagem: 'Use um número inteiro a partir de 0' }]);
      return;
    }
    const stack = valores.stack.split(',').map((s) => s.trim()).filter(Boolean);
    executar(() => onSalvar({ ...valores, ordem, stack }));
  }

  return (
    <form onSubmit={enviar} className="cartao form" noValidate>
      <h2>Dados públicos</h2>
      <label className="campo--check">
        <input
          type="checkbox"
          checked={valores.publicar}
          onChange={(e) => setValores((v) => ({ ...v, publicar: e.target.checked }))}
        />
        Publicar no portfólio
      </label>
      <Campo rotulo="Título público" nome="titulo_publico" erros={erros} {...campo('titulo_publico')} />
      <div className="form--linha">
        <Campo rotulo="Slug" nome="slug" erros={erros} placeholder="meu-projeto" {...campo('slug')} />
        <button
          type="button"
          className="btn"
          onClick={() => setValores((v) => ({ ...v, slug: gerarSlug(v.titulo_publico || projeto.titulo) }))}
        >
          Gerar slug
        </button>
      </div>
      <Campo rotulo="Descrição pública" nome="descricao_publica" erros={erros}>
        <textarea rows={4} {...campo('descricao_publica')} />
      </Campo>
      <Campo rotulo="Tecnologias (separadas por vírgula)" nome="stack" erros={erros} {...campo('stack')} />
      <Campo rotulo="Status público" nome="status_publico" erros={erros} list="status-publico" {...campo('status_publico')} />
      <datalist id="status-publico">{STATUS_SUGERIDOS.map((s) => <option key={s} value={s} />)}</datalist>
      <Campo rotulo="Link do site" nome="live_url" erros={erros} type="url" {...campo('live_url')} />
      <Campo rotulo="Link do código" nome="code_url" erros={erros} type="url" {...campo('code_url')} />
      <Campo rotulo="Ordem no site (0 = primeiro)" nome="ordem" erros={erros} inputMode="numeric" {...campo('ordem')} />
      <Aviso erro={erro} />
      <div><button className="btn btn--primario" disabled={enviando}>Salvar dados públicos</button></div>
    </form>
  );
}

function trocar(lista, indice, delta) {
  const ids = lista.map((x) => x.id);
  const alvo = indice + delta;
  if (alvo < 0 || alvo >= ids.length) return null;
  [ids[indice], ids[alvo]] = [ids[alvo], ids[indice]];
  return ids;
}

function Imagens({ pf, base, executar }) {
  function enviar(e) {
    const arquivos = [...e.target.files];
    e.target.value = '';
    if (!arquivos.length) return;
    const formulario = new FormData();
    arquivos.forEach((a) => formulario.append('imagens', a));
    executar(() => api(`${base}/imagens`, { method: 'POST', body: formulario }));
  }

  function mover(indice, delta) {
    const ids = trocar(pf.imagens, indice, delta);
    if (ids) executar(() => api(`${base}/imagens/ordem`, { method: 'PUT', body: { ids } }));
  }

  return (
    <section className="cartao">
      <h2>Imagens</h2>
      <p className="vazio">A primeira imagem é a capa do projeto no site. PNG, JPG ou WEBP, até 10 MB.</p>
      <label className="btn">
        Adicionar imagens
        <input type="file" accept="image/png,image/jpeg,image/webp" multiple hidden aria-label="Adicionar imagens" onChange={enviar} />
      </label>
      <div className="imagens">
        {pf.imagens.map((img, i) => (
          <figure key={img.id}>
            <img src={img.url} alt={`Imagem ${i + 1}`} />
            <figcaption className="form--linha">
              <span>{i + 1}</span>
              <button type="button" className="btn btn--pequeno" aria-label={`Mover imagem ${i + 1} para antes`} onClick={() => mover(i, -1)}>←</button>
              <button type="button" className="btn btn--pequeno" aria-label={`Mover imagem ${i + 1} para depois`} onClick={() => mover(i, 1)}>→</button>
              <button type="button" className="btn btn--pequeno btn--perigo" aria-label={`Remover imagem ${i + 1}`} onClick={() => executar(() => api(`/portfolio/imagens/${img.id}`, { method: 'DELETE' }))}>×</button>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

function CaseStudy({ pf, base, executar }) {
  function adicionar() {
    executar(() =>
      api(`${base}/case-study`, {
        method: 'POST',
        body: { titulo: `Slide ${pf.case_study.length + 1}`, imagem_id: pf.imagens[0]?.id ?? null },
      }),
    );
  }

  function mover(indice, delta) {
    const ids = trocar(pf.case_study, indice, delta);
    if (ids) executar(() => api(`${base}/case-study/ordem`, { method: 'PUT', body: { ids } }));
  }

  return (
    <section className="cartao">
      <h2>Case study</h2>
      {pf.case_study.length === 0 && <p className="vazio">Sem slides. O botão "Ver projeto" do site mostra só a galeria.</p>}
      {pf.case_study.map((slide, i) => (
        <Slide
          key={`${slide.id}-${slide.atualizado_em}`}
          slide={slide}
          numero={i + 1}
          imagens={pf.imagens}
          executar={executar}
          onMover={(delta) => mover(i, delta)}
        />
      ))}
      <button type="button" className="btn" onClick={adicionar}>+ Slide</button>
    </section>
  );
}

function Slide({ slide, numero, imagens, executar, onMover }) {
  const { valores, campo } = useFormulario({
    titulo: slide.titulo ?? '',
    descricao: slide.descricao ?? '',
    imagem_id: slide.imagem_id ? String(slide.imagem_id) : '',
  });

  function salvar(e) {
    e.preventDefault();
    executar(() =>
      api(`/portfolio/case-study/${slide.id}`, {
        method: 'PUT',
        body: { ...valores, imagem_id: valores.imagem_id ? Number(valores.imagem_id) : null },
      }),
    );
  }

  return (
    <form onSubmit={salvar} className="form slide" noValidate>
      <Campo rotulo={`Título do slide ${numero}`} nome={`slide-${slide.id}-titulo`} {...campo('titulo')} />
      <Campo rotulo={`Imagem do slide ${numero}`} nome={`slide-${slide.id}-imagem`}>
        <select {...campo('imagem_id')}>
          <option value="">Sem imagem</option>
          {imagens.map((img, i) => <option key={img.id} value={img.id}>Imagem {i + 1}</option>)}
        </select>
      </Campo>
      <Campo rotulo={`Descrição do slide ${numero}`} nome={`slide-${slide.id}-descricao`}>
        <textarea rows={3} {...campo('descricao')} />
      </Campo>
      <div className="form--linha">
        <button className="btn btn--primario btn--pequeno" aria-label={`Salvar slide ${numero}`}>Salvar</button>
        <button type="button" className="btn btn--pequeno" aria-label={`Mover slide ${numero} para cima`} onClick={() => onMover(-1)}>↑</button>
        <button type="button" className="btn btn--pequeno" aria-label={`Mover slide ${numero} para baixo`} onClick={() => onMover(1)}>↓</button>
        <button type="button" className="btn btn--pequeno btn--perigo" aria-label={`Remover slide ${numero}`} onClick={() => executar(() => api(`/portfolio/case-study/${slide.id}`, { method: 'DELETE' }))}>Remover</button>
      </div>
    </form>
  );
}
