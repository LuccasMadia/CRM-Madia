# Agrupamento de Lotes por Nome — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agrupar visualmente, na aba de Lotes das placas de avaliação, os lotes de compra que compartilham o mesmo `nome_lote`, mostrando total gasto e intervalo de datas por grupo, com autocomplete no formulário para reduzir nomes digitados "quase iguais".

**Architecture:** Tudo no frontend (React), sem mudanças de schema/API. Uma função pura de agrupamento/ordenação em `web/src/lib/agruparLotes.js` transforma a lista plana de `GET /placas/lotes` numa lista combinada de "entradas" (grupo ou solta). `AbaLotes.jsx` usa essa função para renderizar seções `<details>` expansíveis (grupos) intercaladas com tabelas de linha única (lotes sem nome). `FormPlacaLote.jsx` ganha um `<datalist>` de sugestões vindo dos nomes já usados.

**Tech Stack:** React 19, Vite, Vitest + @testing-library/react + @testing-library/user-event + @testing-library/jest-dom (matchers globais via `web/src/test/setup.js`).

## Global Constraints

- Agrupamento por igualdade **exata** de texto em `nome_lote` (sem normalizar maiúsculas/espaços) — spec: `docs/superpowers/specs/2026-10-03-agrupamento-lotes-design.md`.
- Nenhuma mudança em `server/` (schema, repos, rotas) — tudo é apresentação no frontend.
- Edição/exclusão continuam por lote individual; não existe ação de editar/excluir um grupo inteiro.
- Estado de expandido/recolhido das seções não precisa persistir entre sessões (usar o comportamento nativo e não controlado do `<details>`).
- Sem dependências novas (sem biblioteca de autocomplete — usar `<datalist>` nativo do HTML).

---

### Task 1: Função pura de agrupamento (`agruparLotes.js`)

**Files:**
- Create: `web/src/lib/agruparLotes.js`
- Test: `web/src/lib/agruparLotes.test.js`

**Interfaces:**
- Produces: `agruparLotesPorNome(lotes: Array<{id, material_id, nome_lote, quantidade, valor_kit_centavos, valor_frete_centavos, data_compra}>) => Array<Entrada>`, onde `Entrada` é `{ tipo: 'grupo', nomeLote: string, itens: Lote[], dataMin: string, dataMax: string, totalCentavos: number }` ou `{ tipo: 'solto', lote: Lote }`, retornado já ordenado da entrada mais recente para a mais antiga (grupo usa `dataMax`; solta usa `data_compra`).
- Produces: `nomesLoteDistintos(lotes: Lote[]) => string[]`, nomes distintos e não vazios (após `trim()`), ordenados alfabeticamente (`localeCompare` com locale `'pt-BR'`).

- [ ] **Step 1: Escrever os testes (vão falhar)**

Criar `web/src/lib/agruparLotes.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { agruparLotesPorNome, nomesLoteDistintos } from './agruparLotes.js';

const lote = (overrides) => ({
  id: 1, material_id: 1, nome_lote: '', quantidade: 10,
  valor_kit_centavos: 1000, valor_frete_centavos: 100, data_compra: '2026-10-01',
  ...overrides,
});

describe('agruparLotesPorNome', () => {
  it('agrupa lotes com o mesmo nome_lote e soma kit+frete', () => {
    const lotes = [
      lote({ id: 1, nome_lote: 'Compra Outubro', valor_kit_centavos: 1000, valor_frete_centavos: 100, data_compra: '2026-10-05' }),
      lote({ id: 2, nome_lote: 'Compra Outubro', valor_kit_centavos: 2000, valor_frete_centavos: 200, data_compra: '2026-10-08' }),
    ];
    const [grupo] = agruparLotesPorNome(lotes);
    expect(grupo).toMatchObject({
      tipo: 'grupo', nomeLote: 'Compra Outubro',
      dataMin: '2026-10-05', dataMax: '2026-10-08', totalCentavos: 3300,
    });
    expect(grupo.itens.map((i) => i.id)).toEqual([1, 2]);
  });

  it('grupo com um único item tem dataMin igual a dataMax', () => {
    const lotes = [lote({ id: 1, nome_lote: 'Compra Única', data_compra: '2026-10-05' })];
    const [grupo] = agruparLotesPorNome(lotes);
    expect(grupo.dataMin).toBe('2026-10-05');
    expect(grupo.dataMax).toBe('2026-10-05');
  });

  it('lotes sem nome_lote (vazio ou só espaços) ficam soltos', () => {
    const lotes = [
      lote({ id: 1, nome_lote: '' }),
      lote({ id: 2, nome_lote: '   ' }),
      lote({ id: 3, nome_lote: null }),
    ];
    const entradas = agruparLotesPorNome(lotes);
    expect(entradas).toHaveLength(3);
    expect(entradas.every((e) => e.tipo === 'solto')).toBe(true);
  });

  it('nomes diferentes (maiúsculas/espaços) não se misturam no mesmo grupo', () => {
    const lotes = [
      lote({ id: 1, nome_lote: 'Compra Outubro' }),
      lote({ id: 2, nome_lote: 'compra outubro' }),
    ];
    const entradas = agruparLotesPorNome(lotes);
    expect(entradas.filter((e) => e.tipo === 'grupo')).toHaveLength(2);
  });

  it('ordena grupos e soltos juntos pela data mais recente de cada entrada', () => {
    const lotes = [
      lote({ id: 1, nome_lote: 'Grupo Antigo', data_compra: '2026-09-01' }),
      lote({ id: 2, nome_lote: '', data_compra: '2026-10-10' }),
      lote({ id: 3, nome_lote: 'Grupo Recente', data_compra: '2026-10-15' }),
    ];
    const entradas = agruparLotesPorNome(lotes);
    expect(entradas.map((e) => (e.tipo === 'grupo' ? e.nomeLote : `solto-${e.lote.id}`)))
      .toEqual(['Grupo Recente', 'solto-2', 'Grupo Antigo']);
  });
});

describe('nomesLoteDistintos', () => {
  it('retorna nomes distintos, não vazios, ordenados alfabeticamente', () => {
    const lotes = [
      lote({ nome_lote: 'Compra Outubro' }),
      lote({ nome_lote: 'Compra Outubro' }),
      lote({ nome_lote: 'Compra Agosto' }),
      lote({ nome_lote: '' }),
      lote({ nome_lote: null }),
    ];
    expect(nomesLoteDistintos(lotes)).toEqual(['Compra Agosto', 'Compra Outubro']);
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run web/src/lib/agruparLotes.test.js`
Expected: FAIL com erro de módulo não encontrado (`agruparLotes.js` ainda não existe).

- [ ] **Step 3: Implementar `agruparLotes.js`**

Criar `web/src/lib/agruparLotes.js`:

```js
export function agruparLotesPorNome(lotes) {
  const porNome = new Map();
  const soltos = [];
  for (const loteItem of lotes) {
    const nome = loteItem.nome_lote ?? '';
    if (nome.trim() === '') {
      soltos.push(loteItem);
      continue;
    }
    if (!porNome.has(nome)) porNome.set(nome, []);
    porNome.get(nome).push(loteItem);
  }

  const grupos = [...porNome.entries()].map(([nomeLote, itens]) => {
    const itensOrdenados = [...itens].sort((a, b) => a.data_compra.localeCompare(b.data_compra));
    const datas = itensOrdenados.map((i) => i.data_compra);
    const totalCentavos = itens.reduce((soma, i) => soma + i.valor_kit_centavos + i.valor_frete_centavos, 0);
    return {
      tipo: 'grupo',
      nomeLote,
      itens: itensOrdenados,
      dataMin: datas[0],
      dataMax: datas[datas.length - 1],
      totalCentavos,
    };
  });

  const entradasSoltas = soltos.map((loteItem) => ({ tipo: 'solto', lote: loteItem }));

  const dataOrdenacao = (entrada) => (entrada.tipo === 'grupo' ? entrada.dataMax : entrada.lote.data_compra);
  return [...grupos, ...entradasSoltas].sort((a, b) => dataOrdenacao(b).localeCompare(dataOrdenacao(a)));
}

export function nomesLoteDistintos(lotes) {
  const nomes = new Set();
  for (const loteItem of lotes) {
    const nome = loteItem.nome_lote ?? '';
    if (nome.trim() !== '') nomes.add(nome);
  }
  return [...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run web/src/lib/agruparLotes.test.js`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/agruparLotes.js web/src/lib/agruparLotes.test.js
git commit -m "feat: agrupar lotes de compra por nome_lote (função pura)"
```

---

### Task 2: Autocomplete de `nome_lote` no formulário (`FormPlacaLote.jsx`)

**Files:**
- Modify: `web/src/components/FormPlacaLote.jsx`
- Test: Create `web/src/components/FormPlacaLote.test.jsx`

**Interfaces:**
- Consumes: nenhuma interface de outra task (prop `sugestoesNomeLote` é apenas um `string[]` passado por quem usa o componente; a Task 3 é quem vai de fato alimentá-la com `nomesLoteDistintos` da Task 1).
- Produces: `FormPlacaLote` aceita a prop opcional `sugestoesNomeLote: string[] = []`; renderiza `<datalist id="lista-nomes-lote">` com uma `<option>` por sugestão, e o campo de texto `nome_lote` passa a ter `list="lista-nomes-lote"`.

- [ ] **Step 1: Escrever o teste (vai falhar)**

Criar `web/src/components/FormPlacaLote.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { FormPlacaLote } from './FormPlacaLote.jsx';
import { mockApi } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';

describe('FormPlacaLote', () => {
  it('sugere nomes de lote já usados via datalist, sem travar texto livre', async () => {
    mockApi({ 'GET /placas/materiais': [] });
    renderizar(<FormPlacaLote onSalvar={() => {}} sugestoesNomeLote={['Compra Agosto', 'Compra Outubro']} />);
    const campo = await screen.findByLabelText('Nome do lote (opcional)');
    expect(campo).toHaveAttribute('list', 'lista-nomes-lote');
    const opcoes = [...document.querySelectorAll('#lista-nomes-lote option')].map((o) => o.value);
    expect(opcoes).toEqual(['Compra Agosto', 'Compra Outubro']);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run web/src/components/FormPlacaLote.test.jsx`
Expected: FAIL (atributo `list` ausente e `#lista-nomes-lote` não existe).

- [ ] **Step 3: Implementar a mudança em `FormPlacaLote.jsx`**

Substituir o arquivo `web/src/components/FormPlacaLote.jsx` por:

```jsx
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { useFormulario } from '../hooks/useFormulario.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Campo } from './Campo.jsx';
import { Aviso } from './Aviso.jsx';
import { paraCentavos, centavosParaTexto } from '../lib/dinheiro.js';
import { hojeISO } from '../lib/datas.js';

export function FormPlacaLote({ inicial = {}, rotuloBotao = 'Salvar', onSalvar, sugestoesNomeLote = [] }) {
  const { dados: materiais } = useCarregar(() => api('/placas/materiais'), []);
  const { valores, campo } = useFormulario({
    material_id: inicial.material_id ? String(inicial.material_id) : '',
    nome_lote: inicial.nome_lote ?? '',
    quantidade: inicial.quantidade ? String(inicial.quantidade) : '',
    valor_kit: centavosParaTexto(inicial.valor_kit_centavos),
    valor_frete: centavosParaTexto(inicial.valor_frete_centavos ?? 0),
    data_compra: inicial.data_compra ?? hojeISO(),
  });
  const { erros, erro, enviando, executar, setErros } = useEnvio();

  function enviar(e) {
    e.preventDefault();
    const valorKit = paraCentavos(valores.valor_kit);
    if (valorKit === null || Number.isNaN(valorKit)) {
      setErros([{ campo: 'valor_kit_centavos', mensagem: 'Valor inválido' }]);
      return;
    }
    const valorFrete = valores.valor_frete ? paraCentavos(valores.valor_frete) : 0;
    if (Number.isNaN(valorFrete)) {
      setErros([{ campo: 'valor_frete_centavos', mensagem: 'Valor inválido' }]);
      return;
    }
    executar(() => onSalvar({
      material_id: valores.material_id ? Number(valores.material_id) : null,
      nome_lote: valores.nome_lote,
      quantidade: valores.quantidade ? Number(valores.quantidade) : null,
      valor_kit_centavos: valorKit,
      valor_frete_centavos: valorFrete ?? 0,
      data_compra: valores.data_compra,
    }));
  }

  return (
    <form onSubmit={enviar} className="form" noValidate>
      <Campo rotulo="Material" nome="material_id" erros={erros}>
        <select {...campo('material_id')}>
          <option value="">Selecione…</option>
          {(materiais ?? []).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Nome do lote (opcional)" nome="nome_lote" erros={erros} list="lista-nomes-lote" {...campo('nome_lote')} />
      <datalist id="lista-nomes-lote">
        {sugestoesNomeLote.map((nome) => <option key={nome} value={nome} />)}
      </datalist>
      <Campo rotulo="Quantidade" nome="quantidade" erros={erros} type="number" min="1" {...campo('quantidade')} />
      <Campo rotulo="Valor do kit (R$)" nome="valor_kit_centavos" erros={erros} inputMode="decimal" {...campo('valor_kit')} />
      <Campo rotulo="Valor do frete (R$)" nome="valor_frete_centavos" erros={erros} inputMode="decimal" {...campo('valor_frete')} />
      <Campo rotulo="Data da compra" nome="data_compra" erros={erros} type="date" {...campo('data_compra')} />
      <Aviso erro={erro} />
      <div><button className="btn btn--primario" disabled={enviando}>{rotuloBotao}</button></div>
    </form>
  );
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run web/src/components/FormPlacaLote.test.jsx`
Expected: PASS.

- [ ] **Step 5: Rodar a suíte completa do frontend para checar regressão**

Run: `npx vitest run web/src/pages/Placas.test.jsx`
Expected: PASS (nenhuma mudança de comportamento esperada ainda nesta task).

- [ ] **Step 6: Commit**

```bash
git add web/src/components/FormPlacaLote.jsx web/src/components/FormPlacaLote.test.jsx
git commit -m "feat: autocomplete de nome do lote no formulário de lotes"
```

---

### Task 3: Renderizar grupos e linhas soltas em `AbaLotes.jsx`

**Files:**
- Modify: `web/src/pages/placas/AbaLotes.jsx`
- Test: Modify `web/src/pages/Placas.test.jsx`

**Interfaces:**
- Consumes: `agruparLotesPorNome` e `nomesLoteDistintos` de `web/src/lib/agruparLotes.js` (Task 1); prop `sugestoesNomeLote` de `FormPlacaLote` (Task 2).
- Produces: nenhuma interface nova para outras tasks — esta é a integração final.

- [ ] **Step 1: Escrever os testes (vão falhar)**

Em `web/src/pages/Placas.test.jsx`, adicionar estes três testes dentro do `describe('Placas', ...)`, depois do teste `'lança lote na aba Lotes'`:

```jsx
  it('agrupa lotes com o mesmo nome_lote numa seção expansível com total e intervalo de datas', async () => {
    const pvc = { id: 1, nome: 'Placa 10x10 PVC' };
    const nfc = { id: 2, nome: 'Tag NFC' };
    const loteA = {
      id: 1, material_id: 1, nome_lote: 'Compra Outubro', quantidade: 10,
      valor_kit_centavos: 1000, valor_frete_centavos: 100, data_compra: '2026-10-05',
    };
    const loteB = {
      id: 2, material_id: 2, nome_lote: 'Compra Outubro', quantidade: 20,
      valor_kit_centavos: 2000, valor_frete_centavos: 200, data_compra: '2026-10-08',
    };
    mockApi({
      'GET /placas/resumo': { lucro_previsto_por_modelo: [], lucro_real_por_modelo: [], materiais: [] },
      'GET /placas/materiais': [pvc, nfc],
      'GET /placas/lotes': [loteA, loteB],
    });
    renderizar(<Placas />, { rota: '/placas', padrao: '/placas' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Lotes' }));
    expect(await screen.findByText('Compra Outubro')).toBeInTheDocument();
    expect(screen.getByText('Tag NFC')).not.toBeVisible();
    const resumo = screen.getByText('Compra Outubro').closest('summary');
    expect(resumo.textContent).toContain('05/10/2026 – 08/10/2026');
    expect(resumo.textContent).toContain('R$ 33,00');
    await user.click(screen.getByText('Compra Outubro'));
    expect(screen.getByText('Tag NFC')).toBeVisible();
  });

  it('lote sem nome_lote continua aparecendo como linha solta, fora de qualquer seção', async () => {
    const pvc = { id: 1, nome: 'Placa 10x10 PVC' };
    const loteSolto = {
      id: 3, material_id: 1, nome_lote: '', quantidade: 5,
      valor_kit_centavos: 500, valor_frete_centavos: 0, data_compra: '2026-10-01',
    };
    mockApi({
      'GET /placas/resumo': { lucro_previsto_por_modelo: [], lucro_real_por_modelo: [], materiais: [] },
      'GET /placas/materiais': [pvc],
      'GET /placas/lotes': [loteSolto],
    });
    renderizar(<Placas />, { rota: '/placas', padrao: '/placas' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Lotes' }));
    expect(await screen.findByText('Placa 10x10 PVC')).toBeVisible();
    expect(document.querySelector('details.cartao')).not.toBeInTheDocument();
  });

  it('sugere no formulário de novo lote os nomes de lote já usados', async () => {
    const pvc = { id: 1, nome: 'Placa 10x10 PVC' };
    const loteA = {
      id: 1, material_id: 1, nome_lote: 'Compra Outubro', quantidade: 10,
      valor_kit_centavos: 1000, valor_frete_centavos: 100, data_compra: '2026-10-05',
    };
    mockApi({
      'GET /placas/resumo': { lucro_previsto_por_modelo: [], lucro_real_por_modelo: [], materiais: [] },
      'GET /placas/materiais': [pvc],
      'GET /placas/lotes': [loteA],
    });
    renderizar(<Placas />, { rota: '/placas', padrao: '/placas' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Lotes' }));
    await user.click(await screen.findByRole('button', { name: '+ Lote' }));
    const opcoes = [...document.querySelectorAll('#lista-nomes-lote option')].map((o) => o.value);
    expect(opcoes).toEqual(['Compra Outubro']);
  });
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run web/src/pages/Placas.test.jsx`
Expected: FAIL nos 3 testes novos (ainda não há `<details>`, nem agrupamento, nem `sugestoesNomeLote` passado ao formulário).

- [ ] **Step 3: Implementar a mudança em `AbaLotes.jsx`**

Substituir o arquivo `web/src/pages/placas/AbaLotes.jsx` por:

```jsx
import { useState } from 'react';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { Aviso } from '../../components/Aviso.jsx';
import { Modal } from '../../components/Modal.jsx';
import { FormPlacaLote } from '../../components/FormPlacaLote.jsx';
import { formatarDinheiro } from '../../lib/dinheiro.js';
import { formatarData } from '../../lib/datas.js';
import { agruparLotesPorNome, nomesLoteDistintos } from '../../lib/agruparLotes.js';

export function AbaLotes() {
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState(null);
  const { dados: materiais } = useCarregar(() => api('/placas/materiais'), []);
  const { dados: lotes, erro, recarregar } = useCarregar(() => api('/placas/lotes'), []);

  function nomeMaterial(materialId) {
    return (materiais ?? []).find((m) => m.id === materialId)?.nome ?? '—';
  }

  async function criar(dados) {
    await api('/placas/lotes', { method: 'POST', body: dados });
    setCriando(false);
    recarregar();
  }

  async function salvarEdicao(dados) {
    await api(`/placas/lotes/${editando.id}`, { method: 'PUT', body: dados });
    setEditando(null);
    recarregar();
  }

  async function remover(lote) {
    if (!window.confirm(`Excluir este lote de ${nomeMaterial(lote.material_id)}?`)) return;
    await api(`/placas/lotes/${lote.id}`, { method: 'DELETE' });
    recarregar();
  }

  function linhaLote(l) {
    return (
      <tr key={l.id}>
        <td>{nomeMaterial(l.material_id)}</td>
        <td className="num">{l.quantidade}</td>
        <td className="num">{formatarDinheiro(l.valor_kit_centavos)}</td>
        <td className="num">{formatarDinheiro(l.valor_frete_centavos)}</td>
        <td>{formatarData(l.data_compra)}</td>
        <td>
          <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => setEditando(l)}>Editar</button>{' '}
          <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => remover(l)}>Excluir</button>
        </td>
      </tr>
    );
  }

  function cabecalhoColunas() {
    return <tr><th>Material</th><th className="num">Quantidade</th><th className="num">Kit</th><th className="num">Frete</th><th>Data</th><th></th></tr>;
  }

  const entradas = lotes ? agruparLotesPorNome(lotes) : [];
  const sugestoesNomeLote = lotes ? nomesLoteDistintos(lotes) : [];

  return (
    <section>
      <header className="pagina__topo">
        <h2>Lotes de compra</h2>
        <button type="button" className="btn btn--primario" onClick={() => setCriando(true)}>+ Lote</button>
      </header>
      <Aviso erro={erro} />
      {lotes && (entradas.length ? (
        <div className="lista-lotes">
          {entradas.map((entrada) => (entrada.tipo === 'grupo' ? (
            <details className="cartao" key={`grupo-${entrada.nomeLote}`}>
              <summary>
                <strong>{entrada.nomeLote}</strong>
                {' — '}
                {entrada.dataMin === entrada.dataMax
                  ? formatarData(entrada.dataMin)
                  : `${formatarData(entrada.dataMin)} – ${formatarData(entrada.dataMax)}`}
                {' — '}
                {formatarDinheiro(entrada.totalCentavos)}
              </summary>
              <table className="tabela">
                <thead>{cabecalhoColunas()}</thead>
                <tbody>{entrada.itens.map(linhaLote)}</tbody>
              </table>
            </details>
          ) : (
            <table className="tabela" key={`solto-${entrada.lote.id}`}>
              <thead>{cabecalhoColunas()}</thead>
              <tbody>{linhaLote(entrada.lote)}</tbody>
            </table>
          )))}
        </div>
      ) : <p className="vazio">Nenhum lote lançado ainda.</p>)}
      {criando && (
        <Modal titulo="Novo lote" onFechar={() => setCriando(false)}>
          <FormPlacaLote rotuloBotao="Lançar lote" onSalvar={criar} sugestoesNomeLote={sugestoesNomeLote} />
        </Modal>
      )}
      {editando && (
        <Modal titulo="Editar lote" onFechar={() => setEditando(null)}>
          <FormPlacaLote inicial={editando} rotuloBotao="Salvar" onSalvar={salvarEdicao} sugestoesNomeLote={sugestoesNomeLote} />
        </Modal>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run web/src/pages/Placas.test.jsx`
Expected: PASS (8 testes, incluindo os 5 já existentes e os 3 novos).

- [ ] **Step 5: Rodar a suíte completa do projeto**

Run: `npx vitest run`
Expected: PASS em todos os projetos (`server` e `web`).

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/placas/AbaLotes.jsx web/src/pages/Placas.test.jsx
git commit -m "feat: exibir lotes agrupados por nome com seções expansíveis"
```
