import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { AbaResumo } from '../placas/AbaResumo.jsx';
import { AbaMateriais } from '../placas/AbaMateriais.jsx';
import { AbaLotes } from '../placas/AbaLotes.jsx';
import { AbaModelos } from '../placas/AbaModelos.jsx';
import { AbaVendas } from '../placas/AbaVendas.jsx';
import { AbaMontagem } from '../placas/AbaMontagem.jsx';
import { AbaAvarias } from '../placas/AbaAvarias.jsx';

const ABAS = [
  ['resumo', 'Resumo'],
  ['vendas', 'Vendas'],
  ['montagem', 'Montagem'],
  ['modelos', 'Modelos'],
  ['materiais', 'Materiais'],
  ['lotes', 'Lotes'],
  ['avarias', 'Avarias'],
];

export function PlacasNfc() {
  const [params] = useSearchParams();
  // O perfil do cliente manda para cá com ?nova_venda=<cliente>; o Financeiro, com ?placas=vendas.
  const novaVendaCliente = Number(params.get('nova_venda')) || null;
  const pedida = novaVendaCliente ? 'vendas' : params.get('placas');
  const [aba, setAba] = useState(ABAS.some(([chave]) => chave === pedida) ? pedida : 'resumo');
  return (
    <div>
      <div role="tablist" className="abas">
        {ABAS.map(([chave, rotulo]) => (
          <button key={chave} role="tab" type="button" className="abas__aba" aria-selected={aba === chave} onClick={() => setAba(chave)}>
            {rotulo}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {aba === 'resumo' && <AbaResumo />}
        {aba === 'vendas' && <AbaVendas novaVendaCliente={novaVendaCliente} />}
        {aba === 'montagem' && <AbaMontagem />}
        {aba === 'modelos' && <AbaModelos />}
        {aba === 'materiais' && <AbaMateriais />}
        {aba === 'lotes' && <AbaLotes />}
        {aba === 'avarias' && <AbaAvarias />}
      </div>
    </div>
  );
}
