// Cada categoria ganha sempre a mesma cor (pelo id), tirada da paleta das etiquetas.
const CORES = ['--tag-ceu', '--tag-ambar', '--tag-rosa', '--tag-verde', '--tag-violeta', '--tag-laranja', '--tag-azul', '--tag-lima', '--tag-fucsia'];
export const corDaCategoria = (id) => `var(${CORES[(Number(id) - 1 + CORES.length) % CORES.length]})`;

export function EtiquetasCategorias({ categorias }) {
  if (!categorias?.length) return null;
  return (
    <span className="categorias-etiquetas">
      {categorias.map((c) => (
        <span key={c.id} className="etiqueta etiqueta--categoria" style={{ '--cor': corDaCategoria(c.id) }}>{c.nome}</span>
      ))}
    </span>
  );
}

// Filtro por categoria: uma pílula por categoria, com a mesma cor das etiquetas dos cards.
export function FiltroCategorias({ categorias, valor, onMudar }) {
  if (!categorias?.length) return null;
  return (
    <div className="pilulas filtro-categorias" role="group" aria-label="Categoria">
      <button type="button" className="pilula" aria-pressed={valor === ''} onClick={() => onMudar('')}>Todas</button>
      {categorias.map((c) => (
        <button key={c.id} type="button" className="pilula pilula--categoria" style={{ '--cor': corDaCategoria(c.id) }}
          aria-pressed={valor === String(c.id)} onClick={() => onMudar(valor === String(c.id) ? '' : String(c.id))}>
          {c.nome}
        </button>
      ))}
    </div>
  );
}

export const temCategoria = (projeto, categoriaId) => !categoriaId || (projeto.categorias ?? []).some((c) => String(c.id) === categoriaId);
