import { useState } from 'react';
import { AbaResumo } from './placas/AbaResumo.jsx';
import { AbaMateriais } from './placas/AbaMateriais.jsx';
import { AbaLotes } from './placas/AbaLotes.jsx';
import { AbaModelos } from './placas/AbaModelos.jsx';

const ABAS = [
  ['resumo', 'Resumo'],
  ['materiais', 'Materiais'],
  ['lotes', 'Lotes'],
  ['modelos', 'Modelos'],
];

export function Placas() {
  const [aba, setAba] = useState('resumo');
  return (
    <section>
      <header className="pagina__topo">
        <h1>Placas de avaliação</h1>
      </header>
      <div role="tablist" className="abas">
        {ABAS.map(([chave, rotulo]) => (
          <button key={chave} role="tab" type="button" className="abas__aba" aria-selected={aba === chave} onClick={() => setAba(chave)}>
            {rotulo}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {aba === 'resumo' && <AbaResumo />}
        {aba === 'materiais' && <AbaMateriais />}
        {aba === 'lotes' && <AbaLotes />}
        {aba === 'modelos' && <AbaModelos />}
      </div>
    </section>
  );
}
