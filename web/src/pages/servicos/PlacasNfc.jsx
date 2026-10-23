import { useSearchParams } from 'react-router';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { PedeAtencao } from '../../components/PedeAtencao.jsx';
import { formatarDinheiro } from '../../lib/dinheiro.js';
import { AbaEstoque } from '../placas/AbaEstoque.jsx';
import { AbaMateriais } from '../placas/AbaMateriais.jsx';
import { AbaLotes } from '../placas/AbaLotes.jsx';
import { AbaModelos } from '../placas/AbaModelos.jsx';
import { AbaVendas, VISOES_VENDAS } from '../placas/AbaVendas.jsx';
import { AbaMontagem } from '../placas/AbaMontagem.jsx';
import { AbaAvarias } from '../placas/AbaAvarias.jsx';

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

// Três seções no lugar das sete pílulas antigas: o dia a dia (vendas), o que tem na mão (estoque)
// e o que quase nunca muda (cadastros). A primeira sub de cada lista é a padrão.
const SECOES = [
  ['vendas', 'Vendas', VISOES_VENDAS],
  ['estoque', 'Estoque', [['geral', 'Em estoque'], ['montagem', 'Montagem'], ['lotes', 'Lotes'], ['avarias', 'Avarias']]],
  ['cadastros', 'Cadastros', [['modelos', 'Modelos'], ['materiais', 'Materiais']]],
];

// Links antigos (?placas=lotes etc., do Financeiro e de favoritos) caem na seção/sub nova.
const LEGADO = {
  resumo: ['estoque', 'geral'],
  montagem: ['estoque', 'montagem'],
  lotes: ['estoque', 'lotes'],
  avarias: ['estoque', 'avarias'],
  modelos: ['cadastros', 'modelos'],
  materiais: ['cadastros', 'materiais'],
};

const BASE = '/servicos?aba=placas';
const PARA_A_RECEBER = `${BASE}&placas=vendas&sub=a_receber`;
const PARA_ESTOQUE = `${BASE}&placas=estoque`;

function itensAtencao(resumo) {
  const itens = [];
  const { vendas, total_centavos } = resumo.a_receber;
  if (vendas.length) {
    itens.push({ texto: `${plural(vendas.length, 'venda a receber', 'vendas a receber')} · ${formatarDinheiro(total_centavos)}`, para: PARA_A_RECEBER });
  }
  const atrasadas = vendas.filter((v) => v.estado === 'atrasada').length;
  if (atrasadas) itens.push({ texto: plural(atrasadas, 'venda atrasada', 'vendas atrasadas'), tom: 'perigo', para: PARA_A_RECEBER });
  const negativos = resumo.materiais.filter((m) => m.estoque_atual < 0).length;
  if (negativos) itens.push({ texto: `${plural(negativos, 'material', 'materiais')} com estoque negativo`, tom: 'atencao', para: PARA_ESTOQUE });
  return itens;
}

function Seletor({ rotulo, opcoes, atual, onEscolher }) {
  return (
    <div className="segmentado" role="group" aria-label={rotulo}>
      {opcoes.map(([chave, nome]) => (
        <button key={chave} type="button" aria-pressed={atual === chave} onClick={() => onEscolher(chave)}>{nome}</button>
      ))}
    </div>
  );
}

export function PlacasNfc() {
  const [params, setParams] = useSearchParams();
  // O perfil do cliente manda para cá com ?nova_venda=<cliente>; o Financeiro, com ?placas=vendas.
  const novaVendaCliente = Number(params.get('nova_venda')) || null;
  const pedida = params.get('placas');
  const [secao, subLegado] = novaVendaCliente ? ['vendas'] : LEGADO[pedida] ?? [SECOES.some(([c]) => c === pedida) ? pedida : 'vendas'];
  const [, , subs] = SECOES.find(([c]) => c === secao);
  const subPedida = params.get('sub') ?? subLegado;
  const sub = subs.some(([c]) => c === subPedida) ? subPedida : subs[0][0];

  // O resumo alimenta a faixa "Pede atenção" e a visão de estoque; recarrega ao trocar de lugar
  // e quando alguma aba avisa que mexeu em venda ou estoque.
  const { dados: resumo, erro: erroResumo, recarregar } = useCarregar(() => api('/placas/resumo'), [secao, sub]);

  const irPara = (novaSecao, novaSub) => setParams({ aba: 'placas', placas: novaSecao, ...(novaSub ? { sub: novaSub } : {}) });
  const seletor = <Seletor rotulo="Visão" opcoes={subs} atual={sub} onEscolher={(s) => irPara(secao, s === subs[0][0] ? null : s)} />;

  return (
    <div>
      <PedeAtencao itens={resumo ? itensAtencao(resumo) : null} />
      <div role="tablist" className="pilulas pilulas--secoes" aria-label="Seções de Placas NFC">
        {SECOES.map(([chave, rotulo]) => (
          <button key={chave} role="tab" type="button" className="pilula" aria-selected={secao === chave} onClick={() => irPara(chave)}>
            {rotulo}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {secao === 'vendas' && <AbaVendas visao={sub} seletor={seletor} resumo={resumo} novaVendaCliente={novaVendaCliente} onMudou={recarregar} />}
        {sub === 'geral' && <AbaEstoque resumo={resumo} erro={erroResumo} seletor={seletor} onMudou={recarregar} />}
        {sub === 'montagem' && <AbaMontagem seletor={seletor} onMudou={recarregar} />}
        {sub === 'lotes' && <AbaLotes seletor={seletor} onMudou={recarregar} />}
        {sub === 'avarias' && <AbaAvarias seletor={seletor} onMudou={recarregar} />}
        {sub === 'modelos' && <AbaModelos seletor={seletor} onMudou={recarregar} />}
        {sub === 'materiais' && <AbaMateriais seletor={seletor} onMudou={recarregar} />}
      </div>
    </div>
  );
}
