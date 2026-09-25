# Aba "Divulgação" (unificar Portfólio + Conteúdos) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir as abas separadas "Portfólio" e "Conteúdos" da edição de projeto por uma única aba "Divulgação" que mostra a lista de conteúdos do projeto seguida da gestão do portfólio público.

**Architecture:** Componente novo e fino (`AbaDivulgacao.jsx`) que compõe os dois componentes existentes (`AbaConteudos` e `AbaPortfolio`) sem alterá-los. `Projeto.jsx` troca as duas entradas de aba por uma só, apontando para o componente novo.

**Tech Stack:** React 19, Vitest + Testing Library (`@testing-library/react`, `@testing-library/user-event`), mock de fetch via `web/src/test/mockApi.js`.

## Global Constraints

- Nenhuma mudança de comportamento dentro de `AbaConteudos.jsx` ou `AbaPortfolio.jsx` — ficam exatamente como estão hoje (spec: "Fora de escopo").
- Lista de conteúdos na aba unificada mostra todos os canais, sem filtro (spec: "Escopo").
- Nenhuma mudança de backend/endpoints.
- Testes existentes (`AbaConteudos.test.jsx`, `AbaPortfolio.test.jsx`, `Projeto.test.jsx`) devem continuar passando sem alteração.

---

### Task 1: Criar `AbaDivulgacao.jsx` com teste de composição

**Files:**
- Create: `web/src/pages/projeto/AbaDivulgacao.jsx`
- Test: `web/src/pages/projeto/AbaDivulgacao.test.jsx`

**Interfaces:**
- Consumes: `AbaConteudos` de `./AbaConteudos.jsx` (prop `projetoId: number`), `AbaPortfolio` de `./AbaPortfolio.jsx` (prop `projeto: { id, titulo, ... }`) — ambos já existem, sem mudanças.
- Produces: `AbaDivulgacao` — componente React, prop única `projeto: { id: number, titulo: string, ... }` (o mesmo objeto `projeto` já carregado em `Projeto.jsx`). Consumido por `Projeto.jsx` na Task 2.

- [ ] **Step 1: Escrever o teste (falhando)**

Criar `web/src/pages/projeto/AbaDivulgacao.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AbaDivulgacao } from './AbaDivulgacao.jsx';
import { mockApi } from '../../test/mockApi.js';

const pf = {
  id: 1, projeto_id: 5, publicar: false, slug: null, titulo_publico: null, descricao_publica: null, stack: [],
  status_publico: null, live_url: null, code_url: null, ordem: 0, atualizado_em: 'T1',
  imagens: [], case_study: [],
};
const projeto = { id: 5, titulo: 'Canecas da Dri' };

describe('AbaDivulgacao', () => {
  it('mostra conteúdos e dados públicos do portfólio juntos', async () => {
    mockApi({
      'GET /conteudos?projeto_id=5': [],
      'GET /projetos/5/portfolio': pf,
    });
    render(<AbaDivulgacao projeto={projeto} />);
    expect(await screen.findByText('Conteúdos deste projeto')).toBeInTheDocument();
    expect(await screen.findByText('Dados públicos')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run web/src/pages/projeto/AbaDivulgacao.test.jsx`
Expected: FAIL — `Failed to resolve import "./AbaDivulgacao.jsx"` (arquivo ainda não existe).

- [ ] **Step 3: Criar o componente**

Criar `web/src/pages/projeto/AbaDivulgacao.jsx`:

```jsx
import { AbaConteudos } from './AbaConteudos.jsx';
import { AbaPortfolio } from './AbaPortfolio.jsx';

export function AbaDivulgacao({ projeto }) {
  return (
    <>
      <AbaConteudos projetoId={projeto.id} />
      <AbaPortfolio projeto={projeto} />
    </>
  );
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run web/src/pages/projeto/AbaDivulgacao.test.jsx`
Expected: PASS (1 teste).

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/projeto/AbaDivulgacao.jsx web/src/pages/projeto/AbaDivulgacao.test.jsx
git commit -m "feat: adiciona aba de divulgacao que junta conteudos e portfolio"
```

---

### Task 2: Trocar as abas "Portfólio"/"Conteúdos" por "Divulgação" em `Projeto.jsx`

**Files:**
- Modify: `web/src/pages/projeto/Projeto.jsx:1-20` (imports e array `ABAS`), `:49-55` (painel)
- Test: `web/src/pages/projeto/Projeto.test.jsx` (nenhuma mudança de conteúdo necessária — só rodar para confirmar que continua passando)

**Interfaces:**
- Consumes: `AbaDivulgacao` de `./AbaDivulgacao.jsx` (prop `projeto`), criado na Task 1.
- Produces: nada consumido por outras tasks — é o ponto final da integração.

- [ ] **Step 1: Atualizar imports e array `ABAS`**

Em `web/src/pages/projeto/Projeto.jsx`, trocar:

```js
import { AbaPortfolio } from './AbaPortfolio.jsx';
import { AbaConteudos } from './AbaConteudos.jsx';

const ABAS = [
  ['geral', 'Visão geral'],
  ['tarefas', 'Tarefas'],
  ['financeiro', 'Financeiro'],
  ['portfolio', 'Portfólio'],
  ['conteudos', 'Conteúdos'],
];
```

por:

```js
import { AbaDivulgacao } from './AbaDivulgacao.jsx';

const ABAS = [
  ['geral', 'Visão geral'],
  ['tarefas', 'Tarefas'],
  ['financeiro', 'Financeiro'],
  ['divulgacao', 'Divulgação'],
];
```

- [ ] **Step 2: Atualizar o painel de conteúdo da aba**

Trocar:

```jsx
        {aba === 'portfolio' && <AbaPortfolio projeto={projeto} />}
        {aba === 'conteudos' && <AbaConteudos projetoId={projeto.id} />}
```

por:

```jsx
        {aba === 'divulgacao' && <AbaDivulgacao projeto={projeto} />}
```

- [ ] **Step 3: Rodar a suíte de testes do projeto**

Run: `npx vitest run web/src/pages/projeto/Projeto.test.jsx web/src/pages/projeto/AbaConteudos.test.jsx web/src/pages/projeto/AbaPortfolio.test.jsx web/src/pages/projeto/AbaDivulgacao.test.jsx`
Expected: PASS em todos (o arquivo `Projeto.test.jsx` não referencia nomes de aba, então continua passando sem alteração).

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/projeto/Projeto.jsx
git commit -m "feat: unifica abas portfolio e conteudos em divulgacao na edicao de projeto"
```

---

### Task 3: Verificação final

**Files:** nenhum (só execução).

- [ ] **Step 1: Rodar a suíte completa**

Run: `npx vitest run`
Expected: todos os arquivos de teste passam, sem regressões em outras páginas (`Projetos.test.jsx`, `Funil.test.jsx`, etc.).

- [ ] **Step 2: Conferir manualmente (opcional, se o dev server estiver disponível)**

Abrir um projeto existente em `/projetos/:id`, confirmar que a aba "Divulgação" aparece no lugar de "Portfólio"/"Conteúdos", que a lista de conteúdos aparece no topo e os dados públicos do portfólio logo abaixo, e que criar/editar conteúdo e salvar dados públicos continuam funcionando.
