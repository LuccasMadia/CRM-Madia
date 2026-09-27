# Aba "Fictícios" no Funil Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O Funil ganha duas sub-abas — "Reais" e "Fictícios" — pra que projetos fictícios (`ficticio = 1`) tenham seu próprio kanban, com colunas reduzidas a "Em andamento"/"Entregue", sem se misturar com o funil de vendas real.

**Architecture:** Reaproveita o componente `Kanban.jsx` existente (agnóstico de dados/colunas) trocando a URL de fetch e o array de colunas conforme a aba ativa, controlada por `useState` local em `Funil.jsx`. `FormOportunidade.jsx` ganha um prop `ficticioFixo` e passa a calcular as opções de etapa a partir do próprio estado do checkbox "fictício", em vez de uma lista fixa.

**Tech Stack:** React (hooks `useState`/`useCarregar`/`useFormulario`), Vitest + Testing Library, sem mudanças de backend.

## Global Constraints

- Sem mudança de schema ou de rotas do backend — `GET /projetos?ficticio=0|1` já existe (spec: "Sem mudança no backend").
- Restrição de etapas fictício (`ETAPAS_FICTICIO = ['andamento', 'entregue']`) é só de UI, não é validada no servidor (spec, seção "Sem mudança no backend").
- Lista de Projetos (tabela) e detalhe do projeto continuam sem sub-abas (spec, seção "Fora de escopo").
- Reaproveitar o padrão visual de abas já usado em `web/src/pages/projeto/Projeto.jsx` (`role="tablist"`, classe `.abas`/`.abas__aba`) — não criar um novo estilo de toggle.

---

### Task 1: `ETAPAS_FICTICIO` em `lib/rotulos.js`

**Files:**
- Modify: `web/src/lib/rotulos.js`
- Test: `web/src/lib/rotulos.test.js` (criar se não existir; checar antes)

**Interfaces:**
- Produces: `ETAPAS_FICTICIO` (`string[]`, valor `['andamento', 'entregue']`), exportado de `web/src/lib/rotulos.js`, consumido nas Tasks 2 e 3.

- [ ] **Step 1: Checar se já existe teste pra `rotulos.js`**

Rodar: `ls web/src/lib/rotulos.test.js`
Se não existir, os próximos steps de teste criam o arquivo do zero; se existir, adicionar o `describe` novo nele.

- [ ] **Step 2: Escrever o teste (falhando)**

Criar/editar `web/src/lib/rotulos.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { ETAPAS, ETAPAS_FICTICIO, ROTULO_ETAPA } from './rotulos.js';

describe('ETAPAS_FICTICIO', () => {
  it('só tem andamento e entregue, nessa ordem', () => {
    expect(ETAPAS_FICTICIO).toEqual(['andamento', 'entregue']);
  });

  it('todo item de ETAPAS_FICTICIO existe em ETAPAS e tem rótulo', () => {
    for (const etapa of ETAPAS_FICTICIO) {
      expect(ETAPAS).toContain(etapa);
      expect(ROTULO_ETAPA[etapa]).toBeTruthy();
    }
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Rodar: `cd web && npx vitest run src/lib/rotulos.test.js`
Esperado: FAIL — `ETAPAS_FICTICIO` não é exportado por `rotulos.js`.

- [ ] **Step 4: Implementar**

Em `web/src/lib/rotulos.js`, logo depois de `export const ETAPAS = Object.keys(ROTULO_ETAPA);`:

```js
export const ETAPAS_FICTICIO = ['andamento', 'entregue'];
```

- [ ] **Step 5: Rodar e confirmar que passa**

Rodar: `cd web && npx vitest run src/lib/rotulos.test.js`
Esperado: PASS (2 testes).

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/rotulos.js web/src/lib/rotulos.test.js
git commit -m "feat: adiciona ETAPAS_FICTICIO para o kanban de fictícios"
```

---

### Task 2: `FormOportunidade` — etapa reativa ao checkbox fictício + prop `ficticioFixo`

**Files:**
- Modify: `web/src/components/FormOportunidade.jsx`
- Test: `web/src/pages/Funil.test.jsx` (o form só é exercitado através da página `Funil`, não tem teste próprio — seguir o padrão já usado nos testes existentes de "nova oportunidade")

**Interfaces:**
- Consumes: `ETAPAS_FICTICIO` de `web/src/lib/rotulos.js` (Task 1).
- Produces: `FormOportunidade({ onSalvar, ficticioFixo })` — novo prop opcional `ficticioFixo` (`boolean`, padrão `false`), consumido pela Task 3 (`Funil.jsx`).

- [ ] **Step 1: Escrever o teste (falhando) — etapa muda ao marcar o checkbox**

Adicionar em `web/src/pages/Funil.test.jsx`, dentro do `describe('Funil', ...)`:

```js
  it('nova oportunidade: marcar "fictício" restringe etapa a andamento/entregue', async () => {
    mockApi({ 'GET /projetos?ficticio=0': [], 'GET /clientes': [] });
    abrir();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '+ Oportunidade' }));
    await user.click(screen.getByLabelText('Projeto fictício (só portfólio)'));
    const opcoes = within(screen.getByLabelText('Etapa')).getAllByRole('option').map((o) => o.textContent);
    expect(opcoes).toEqual(['Em andamento', 'Entregue']);
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Rodar: `cd web && npx vitest run src/pages/Funil.test.jsx -t "restringe etapa"`
Esperado: FAIL — o select de etapa ainda lista todas as `ETAPAS` (Contato, Proposta enviada, Em andamento, Entregue, Perdido).

- [ ] **Step 3: Implementar em `FormOportunidade.jsx`**

Arquivo completo atualizado:

```jsx
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { useFormulario } from '../hooks/useFormulario.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Campo } from './Campo.jsx';
import { Aviso } from './Aviso.jsx';
import { paraCentavos } from '../lib/dinheiro.js';
import { ETAPAS, ETAPAS_FICTICIO, ROTULO_ETAPA } from '../lib/rotulos.js';

export function FormOportunidade({ onSalvar, ficticioFixo = false }) {
  const { dados: clientes } = useCarregar(() => api('/clientes'), []);
  const { valores, campo, setValores } = useFormulario({
    titulo: '', cliente_id: '', novo_cliente_nome: '', valor: '', prazo_entrega: '',
    etapa: ficticioFixo ? 'andamento' : 'contato', ficticio: ficticioFixo,
  });
  const { erros, erro, enviando, executar, setErros } = useEnvio();
  const clienteNovo = valores.cliente_id === 'novo';
  const etapasDisponiveis = valores.ficticio ? ETAPAS_FICTICIO : ETAPAS;

  function alternarFicticio(marcado) {
    setValores((v) => ({
      ...v,
      ficticio: marcado,
      etapa: marcado ? 'andamento' : 'contato',
    }));
  }

  function enviar(e) {
    e.preventDefault();
    const valor = paraCentavos(valores.valor);
    if (Number.isNaN(valor)) {
      setErros([{ campo: 'valor_total_centavos', mensagem: 'Valor inválido' }]);
      return;
    }
    const corpo = {
      titulo: valores.titulo, etapa: valores.etapa, valor_total_centavos: valor ?? 0,
      prazo_entrega: valores.prazo_entrega, ficticio: valores.ficticio,
    };
    if (clienteNovo) corpo.novo_cliente = { nome: valores.novo_cliente_nome };
    else corpo.cliente_id = valores.cliente_id ? Number(valores.cliente_id) : null;
    executar(() => onSalvar(corpo));
  }

  return (
    <form onSubmit={enviar} className="form" noValidate>
      <Campo rotulo="Título" nome="titulo" erros={erros} {...campo('titulo')} />
      <Campo rotulo="Cliente" nome="cliente_id" erros={erros}>
        <select {...campo('cliente_id')}>
          <option value="">Selecione…</option>
          {(clientes ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          <option value="novo">+ Novo cliente</option>
        </select>
      </Campo>
      {clienteNovo && (
        <Campo rotulo="Nome do novo cliente" nome="novo_cliente.nome" erros={erros} {...campo('novo_cliente_nome')} />
      )}
      <Campo rotulo="Etapa" nome="etapa" erros={erros}>
        <select {...campo('etapa')}>
          {etapasDisponiveis.map((e) => <option key={e} value={e}>{ROTULO_ETAPA[e]}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Valor (R$)" nome="valor_total_centavos" erros={erros} inputMode="decimal" placeholder="0,00" {...campo('valor')} />
      <Campo rotulo="Prazo de entrega" nome="prazo_entrega" erros={erros} type="date" {...campo('prazo_entrega')} />
      <div className="campo">
        <label>
          <input
            type="checkbox"
            checked={Boolean(valores.ficticio)}
            disabled={ficticioFixo}
            onChange={(e) => alternarFicticio(e.target.checked)}
          />{' '}
          Projeto fictício (só portfólio)
        </label>
      </div>
      <Aviso erro={erro} />
      <div><button className="btn btn--primario" disabled={enviando}>Criar oportunidade</button></div>
    </form>
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Rodar: `cd web && npx vitest run src/pages/Funil.test.jsx`
Esperado: PASS em todos os testes do arquivo, incluindo o novo.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/FormOportunidade.jsx web/src/pages/Funil.test.jsx
git commit -m "feat: etapa do formulário de oportunidade reage ao checkbox fictício"
```

---

### Task 3: Sub-abas "Reais"/"Fictícios" em `Funil.jsx`

**Files:**
- Modify: `web/src/pages/Funil.jsx`
- Test: `web/src/pages/Funil.test.jsx`

**Interfaces:**
- Consumes: `ETAPAS_FICTICIO` (Task 1), `FormOportunidade({ onSalvar, ficticioFixo })` (Task 2).
- Produces: nenhuma interface nova consumida por outras tasks — esta é a última task do plano.

- [ ] **Step 1: Escrever os testes (falhando)**

Adicionar em `web/src/pages/Funil.test.jsx`, dentro do `describe('Funil', ...)`:

```js
  it('aba Fictícios carrega só fictícios e mostra colunas reduzidas', async () => {
    const ficticios = [
      { id: 5, titulo: 'Case Padaria', cliente_nome: 'Case', etapa: 'andamento', valor_total_centavos: 0, prazo_entrega: null },
    ];
    mockApi({ 'GET /projetos?ficticio=0': projetos, 'GET /projetos?ficticio=1': ficticios });
    abrir();
    await screen.findByRole('region', { name: 'Contato' });
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Fictícios' }));
    expect(await screen.findByRole('link', { name: 'Case Padaria' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Contato' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Proposta enviada' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Perdido' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Em andamento' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Entregue' })).toBeInTheDocument();
  });

  it('+ Oportunidade na aba Fictícios cria com ficticio travado e etapa andamento', async () => {
    const { chamadas } = mockApi({
      'GET /projetos?ficticio=0': [], 'GET /projetos?ficticio=1': [], 'GET /clientes': [{ id: 3, nome: 'Carla' }], 'POST /projetos': { id: 9 },
    });
    abrir();
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: 'Fictícios' }));
    await user.click(await screen.findByRole('button', { name: '+ Oportunidade' }));
    const checkboxFicticio = screen.getByLabelText('Projeto fictício (só portfólio)');
    expect(checkboxFicticio).toBeChecked();
    expect(checkboxFicticio).toBeDisabled();
    await user.type(screen.getByLabelText('Título'), 'Case Padaria');
    await user.selectOptions(screen.getByLabelText('Cliente'), 'novo');
    await user.type(screen.getByLabelText('Nome do novo cliente'), 'Case');
    await user.type(screen.getByLabelText('Valor (R$)'), '0,00');
    await user.click(screen.getByRole('button', { name: 'Criar oportunidade' }));
    expect(await screen.findByText('Outra página')).toBeInTheDocument();
    expect(chamadas.find((c) => c.metodo === 'POST').corpo).toEqual({
      titulo: 'Case Padaria', etapa: 'andamento', valor_total_centavos: 0, prazo_entrega: '', ficticio: true, novo_cliente: { nome: 'Case' },
    });
  });

  it('move um card fictício pelo menu do card', async () => {
    const ficticios = [{ id: 5, titulo: 'Case Padaria', cliente_nome: 'Case', etapa: 'andamento', valor_total_centavos: 0, prazo_entrega: null }];
    const { chamadas } = mockApi({
      'GET /projetos?ficticio=0': [], 'GET /projetos?ficticio=1': ficticios, 'PUT /projetos/5': { ...ficticios[0], etapa: 'entregue' },
    });
    abrir();
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Fictícios' }));
    await userEvent.setup().selectOptions(await screen.findByLabelText('Mover Case Padaria'), 'entregue');
    expect(chamadas.find((c) => c.metodo === 'PUT')).toEqual({ metodo: 'PUT', caminho: '/projetos/5', corpo: { etapa: 'entregue' } });
  });
```

- [ ] **Step 2: Rodar e confirmar que falham**

Rodar: `cd web && npx vitest run src/pages/Funil.test.jsx`
Esperado: FAIL nos 3 testes novos — não existe `role="tab"` com nome "Fictícios" na página ainda.

- [ ] **Step 3: Implementar em `Funil.jsx`**

Arquivo completo atualizado:

```jsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Aviso } from '../components/Aviso.jsx';
import { Modal } from '../components/Modal.jsx';
import { Kanban } from '../components/Kanban.jsx';
import { FormOportunidade } from '../components/FormOportunidade.jsx';
import { formatarDinheiro } from '../lib/dinheiro.js';
import { formatarData } from '../lib/datas.js';
import { ETAPAS, ETAPAS_FICTICIO, ROTULO_ETAPA } from '../lib/rotulos.js';

const ABAS = [
  ['reais', 'Reais'],
  ['ficticios', 'Fictícios'],
];

export function Funil() {
  const [aba, setAba] = useState('reais');
  const ficticio = aba === 'ficticios';
  const { dados: projetos, erro, recarregar } = useCarregar(
    () => api(`/projetos?ficticio=${ficticio ? 1 : 0}`),
    [ficticio],
  );
  const [criando, setCriando] = useState(false);
  const mudanca = useEnvio();
  const navegar = useNavigate();

  const colunas = (ficticio ? ETAPAS_FICTICIO : ETAPAS).map((id) => ({ id, titulo: ROTULO_ETAPA[id] }));

  function mover(projeto, etapa) {
    mudanca.executar(async () => {
      await api(`/projetos/${projeto.id}`, { method: 'PUT', body: { etapa } });
      recarregar();
    });
  }

  async function criar(dados) {
    const projeto = await api('/projetos', { method: 'POST', body: dados });
    navegar(`/projetos/${projeto.id}`);
  }

  return (
    <section>
      <header className="pagina__topo">
        <h1>Funil</h1>
        <button type="button" className="btn btn--primario" onClick={() => setCriando(true)}>+ Oportunidade</button>
      </header>
      <div role="tablist" className="abas">
        {ABAS.map(([chave, rotulo]) => (
          <button key={chave} role="tab" type="button" className="abas__aba" aria-selected={aba === chave} onClick={() => setAba(chave)}>
            {rotulo}
          </button>
        ))}
      </div>
      <Aviso erro={erro ?? mudanca.erro} />
      {projetos && (
        <Kanban
          colunas={colunas}
          itens={projetos}
          colunaDe={(p) => p.etapa}
          tituloDe={(p) => p.titulo}
          recolhidas={ficticio ? [] : ['perdido']}
          onMover={mover}
          renderItem={(p) => (
            <>
              <Link to={`/projetos/${p.id}`} className="kanban__titulo">{p.titulo}</Link>
              <p className="kanban__meta">{p.cliente_nome}</p>
              <p className="kanban__meta">{formatarDinheiro(p.valor_total_centavos)} · prazo {formatarData(p.prazo_entrega)}</p>
            </>
          )}
        />
      )}
      {criando && (
        <Modal titulo="Nova oportunidade" onFechar={() => setCriando(false)}>
          <FormOportunidade onSalvar={criar} ficticioFixo={ficticio} />
        </Modal>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Rodar: `cd web && npx vitest run src/pages/Funil.test.jsx`
Esperado: PASS em todos os testes do arquivo (os 4 originais + os 2 da Task 2/3 novos).

- [ ] **Step 5: Rodar a suíte inteira do front pra checar regressão**

Rodar: `cd web && npx vitest run`
Esperado: PASS em todos os arquivos (nenhum outro teste consome `Funil.jsx` ou `FormOportunidade.jsx` fora de `Funil.test.jsx`).

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/Funil.jsx web/src/pages/Funil.test.jsx
git commit -m "feat: adiciona sub-aba Fictícios ao Funil"
```

---

## Self-Review Notes

- **Cobertura do spec:** constante `ETAPAS_FICTICIO` → Task 1; reatividade do select de etapa ao checkbox + `ficticioFixo` travado → Task 2; sub-abas, troca de fetch/colunas, `recolhidas` condicional, integração do `FormOportunidade` na página → Task 3. Os itens de "Fora de escopo" do spec (lista de Projetos, detalhe do projeto, validação de etapa no backend) não têm task correspondente, como esperado.
- **Placeholders:** nenhum "TBD"/"similar a"/passo sem código — cada step de implementação mostra o arquivo completo ou o trecho exato.
- **Consistência de tipos/nomes:** `ETAPAS_FICTICIO` (Task 1) é importado com esse nome exato nas Tasks 2 e 3; `FormOportunidade({ onSalvar, ficticioFixo })` (Task 2) é chamado com essa assinatura exata em `Funil.jsx` (Task 3); `aba`/`ficticio` (variável local derivada de `aba === 'ficticios'`) usados de forma consistente dentro de `Funil.jsx`.
