export function SeletorCategorias({ categorias, selecionadas, onChange, erro }) {
  function alternar(id) {
    const marcadas = selecionadas.includes(id) ? selecionadas.filter((s) => s !== id) : [...selecionadas, id];
    onChange(categorias.map((c) => c.id).filter((c) => marcadas.includes(c)));
  }

  return (
    <div className="campo">
      <span className="campo__rotulo" id="rotulo-categorias">Categorias</span>
      <div className="pilulas" role="group" aria-labelledby="rotulo-categorias">
        {categorias.map((c) => (
          <button key={c.id} type="button" className="pilula" aria-pressed={selecionadas.includes(c.id)} onClick={() => alternar(c.id)}>
            {c.nome}
          </button>
        ))}
      </div>
      {erro && <p className="campo__erro" role="alert">{erro}</p>}
    </div>
  );
}
