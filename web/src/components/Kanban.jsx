import { useState } from 'react';

export function Kanban({ colunas, itens, colunaDe, tituloDe, onMover, renderItem, recolhidas = [] }) {
  const [abertas, setAbertas] = useState([]);
  const [alvo, setAlvo] = useState(null);

  function soltar(e, coluna) {
    e.preventDefault();
    setAlvo(null);
    const id = Number(e.dataTransfer.getData('text/plain'));
    const item = itens.find((i) => i.id === id);
    if (item && colunaDe(item) !== coluna) onMover(item, coluna);
  }

  const alternar = (coluna) =>
    setAbertas((a) => (a.includes(coluna) ? a.filter((c) => c !== coluna) : [...a, coluna]));

  return (
    <div className="kanban">
      {colunas.map((coluna) => {
        const daColuna = itens.filter((i) => colunaDe(i) === coluna.id);
        const recolhivel = recolhidas.includes(coluna.id);
        const recolhida = recolhivel && !abertas.includes(coluna.id);
        const classes = ['kanban__coluna', alvo === coluna.id && 'kanban__coluna--alvo', recolhida && 'kanban__coluna--recolhida']
          .filter(Boolean).join(' ');
        return (
          <section
            key={coluna.id}
            className={classes}
            aria-label={coluna.titulo}
            onDragOver={(e) => { e.preventDefault(); setAlvo(coluna.id); }}
            onDragLeave={() => setAlvo((a) => (a === coluna.id ? null : a))}
            onDrop={(e) => soltar(e, coluna.id)}
          >
            <header className="kanban__topo">
              <h2>{coluna.titulo} <span className="kanban__contagem">{daColuna.length}</span></h2>
              {recolhivel && (
                <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => alternar(coluna.id)}>
                  {recolhida ? 'Mostrar' : 'Recolher'}
                </button>
              )}
            </header>
            {!recolhida && daColuna.map((item) => (
              <article
                key={item.id}
                className="kanban__card"
                draggable
                onDragStart={(e) => e.dataTransfer.setData('text/plain', String(item.id))}
              >
                {renderItem(item)}
                <select
                  className="kanban__mover"
                  aria-label={`Mover ${tituloDe(item)}`}
                  value={colunaDe(item)}
                  onChange={(e) => onMover(item, e.target.value)}
                >
                  {colunas.map((c) => <option key={c.id} value={c.id}>{c.titulo}</option>)}
                </select>
              </article>
            ))}
          </section>
        );
      })}
    </div>
  );
}
