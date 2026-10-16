# Tema escuro turquesa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a identidade visual do app inteiro para um tema sempre escuro (fundo preto, cards cinza-escuro) com turquesa de destaque, sem mudar estrutura, formulários ou textos.

**Architecture:** Quase tudo é CSS: os tokens em `:root` de `web/src/styles.css` mudam e as regras de componentes passam a usar os tokens novos (cards, botões, campos, etiquetas em pílula, sidebar, cabeçalho). A fonte Inter entra como dependência embutida (`@fontsource-variable/inter`). Única mudança de componente: `Numero.jsx` ganha a prop opcional `icone`.

**Tech Stack:** React 19, Vite 8 (+ vite-plugin-pwa), CSS puro com variáveis, Vitest 5 + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-16-tema-escuro-e-dashboard-design.md` (só a **Parte 1 — Tema**; Partes 2 e 3 têm plano próprio, depois do plano do perfil por serviço).

## Global Constraints

- Sempre escuro: sem `@media (prefers-color-scheme: …)`; `color-scheme: dark`.
- Tokens com os valores exatos da spec: `--fundo #0a0a0b`, `--superficie #141517`, `--superficie-2 #1c1e21`, `--borda #24262a`, `--texto #ececee`, `--texto-suave #8b9099`, `--primaria #2dd4bf`, `--primaria-texto #04201c`, `--primaria-suave rgb(45 212 191 / 0.12)`, `--t1…--t5 #5eead4 #2dd4bf #14b8a6 #0d9488 #0f766e`, `--perigo #f87171`, `--ok #4ade80`, `--atencao #fbbf24`, `--raio 16px`, `--raio-controle 10px`, `--sombra 0 8px 24px rgb(0 0 0 / 0.35)`.
- Fonte: Inter via `@fontsource-variable/inter`, fallback `system-ui`.
- Manifest PWA e `<meta name="theme-color">`: `#0a0a0b`.
- Não mudar estrutura de telas, formulários nem textos (exceto adicionar ícones aos cartões de número).
- Commits em Conventional Commits, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Rodar testes com `npx vitest run <arquivo>` (ou `npx vitest run` para tudo) na raiz do repositório.
- O app real roda no pm2 (`crm-madia-api` e `crm-madia-web`, Vite em `http://127.0.0.1:5173`). CSS recarrega sozinho; **depois de instalar dependência nova, rodar `pm2 restart crm-madia-web`**.

## Review Focus

1. **Controles nativos no escuro** (`<select>` aberto, `<input type="date">` e seu ícone de calendário, checkbox): precisam ficar legíveis — `color-scheme: dark` resolve; conferir na Task 4.
2. **Pré-visualização de QR code** (`.qrcode-preview`) deve **continuar com fundo branco**, senão o QR fica ilegível para escanear — Task 2 mantém `background: #fff`; conferir na Task 4.
3. **Etiqueta sem modificador ou com estado desconhecido** (ex.: `etiqueta--contato`, `etiqueta--ideia`, a etiqueta do tipo em "Próximos 7 dias") deve cair no estilo neutro, não sumir nem ficar sem fundo — Task 2 define o neutro na classe base.
4. **Celular (≤ 760px)**: sidebar continua horizontal com rolagem própria e a página não ganha rolagem horizontal — conferir na Task 4.
5. **`Numero` sem `icone`** (usado em `AbaFinanceiro.jsx`) deve renderizar exatamente como antes, sem quadrado vazio — teste na Task 3.

---

## Mapa de arquivos

- Modify `package.json` / `package-lock.json` — dependência `@fontsource-variable/inter`.
- Modify `web/src/main.jsx` — importa a fonte.
- Modify `web/index.html` — `theme-color`.
- Modify `vite.config.js` — `background_color`/`theme_color` do manifest.
- Modify `web/src/styles.css` — tokens (Task 1) e regras de componentes (Task 2).
- Modify `web/src/components/Numero.jsx` — prop `icone`.
- Create `web/src/components/Numero.test.jsx`.
- Modify `web/src/components/Icone.jsx` — desenho novo `alerta`.
- Modify `web/src/pages/Inicio.jsx` — ícones nos 4 cartões.

---

### Task 1: Tokens escuros, fonte Inter e cor do PWA

**Files:**
- Modify: `web/src/styles.css:1-31` (bloco `:root` e o `@media (prefers-color-scheme: dark)`)
- Modify: `web/src/main.jsx`
- Modify: `web/index.html:6`
- Modify: `vite.config.js:20-21`
- Modify: `package.json`, `package-lock.json`

**Interfaces:**
- Produces: variáveis CSS `--fundo`, `--superficie`, `--superficie-2`, `--borda`, `--texto`, `--texto-suave`, `--primaria`, `--primaria-texto`, `--primaria-suave`, `--t1`…`--t5`, `--perigo`, `--ok`, `--atencao`, `--raio`, `--raio-controle`, `--sombra` — usadas pela Task 2 e pelo futuro plano do dashboard.

- [ ] **Step 1: Instalar a fonte**

Run: `npm install @fontsource-variable/inter`
Expected: `package.json` ganha `"@fontsource-variable/inter"` em `dependencies`.

- [ ] **Step 2: Importar a fonte em `web/src/main.jsx`**

Adicionar a linha antes de `import './styles.css';`:

```js
import '@fontsource-variable/inter';
import './styles.css';
```

- [ ] **Step 3: Substituir o topo de `web/src/styles.css`**

Trocar tudo da linha 1 até o fim do bloco `@media (prefers-color-scheme: dark) { … }` (linha 31) por:

```css
:root {
  --fundo: #0a0a0b;
  --superficie: #141517;
  --superficie-2: #1c1e21;
  --borda: #24262a;
  --texto: #ececee;
  --texto-suave: #8b9099;
  --primaria: #2dd4bf;
  --primaria-texto: #04201c;
  --primaria-suave: rgb(45 212 191 / 0.12);
  --t1: #5eead4;
  --t2: #2dd4bf;
  --t3: #14b8a6;
  --t4: #0d9488;
  --t5: #0f766e;
  --perigo: #f87171;
  --ok: #4ade80;
  --atencao: #fbbf24;
  --raio: 16px;
  --raio-controle: 10px;
  --sombra: 0 8px 24px rgb(0 0 0 / 0.35);
  font-family: 'Inter Variable', system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: var(--texto);
  background: var(--fundo);
  color-scheme: dark;
}
```

(O bloco `@media (prefers-color-scheme: dark)` é apagado por inteiro.)

- [ ] **Step 4: Cor do tema no HTML e no manifest**

Em `web/index.html`, linha 6:

```html
    <meta name="theme-color" content="#0a0a0b" />
```

Em `vite.config.js`, linhas 20-21:

```js
        background_color: '#0a0a0b',
        theme_color: '#0a0a0b',
```

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npx vitest run`
Expected: todos os testes passam (nada de comportamento mudou).

- [ ] **Step 6: Conferir o build**

Run: `npx vite build`
Expected: build conclui sem erro (`dist/` já está no `.gitignore`).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json web/src/main.jsx web/src/styles.css web/index.html vite.config.js
git commit -m "feat: tokens do tema escuro turquesa e fonte inter

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Regras de componentes no estilo novo

**Files:**
- Modify: `web/src/styles.css` (tudo depois do bloco `:root` da Task 1)

**Interfaces:**
- Consumes: tokens da Task 1.
- Produces: classes `.cartao-numero`, `.cartao-numero__icone`, `.cartao-numero__texto` (usadas pela Task 3); `.etiqueta--proposta` passa a ter cor (classe já gerada por `etiqueta--${etapa}`).

- [ ] **Step 1: Substituir todas as regras depois de `:root`**

Trocar todo o conteúdo de `web/src/styles.css` depois do bloco `:root { … }` (da linha `* { box-sizing: border-box; }` até o fim do arquivo) por:

```css
* { box-sizing: border-box; }
body { margin: 0; background: var(--fundo); -webkit-font-smoothing: antialiased; }
a { color: var(--primaria); text-decoration: none; }
a:hover { text-decoration: underline; }
code { font-size: 0.9em; }

.app { display: grid; grid-template-columns: auto 1fr; min-height: 100vh; }
.sidebar { background: var(--superficie); border-right: 1px solid var(--borda); padding: 24px 16px; position: sticky; top: 0; height: 100vh; width: 220px; box-sizing: border-box; overflow-x: hidden; transition: width 0.15s ease, padding 0.15s ease; }
.sidebar__topo { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 0 0 28px; }
.sidebar__marca { font-weight: 700; font-size: 1.15rem; margin: 0 0 0 8px; white-space: nowrap; letter-spacing: -0.01em; }
.sidebar__alternar { display: inline-flex; align-items: center; justify-content: center; padding: 6px; border: 0; border-radius: var(--raio-controle); background: transparent; color: var(--texto-suave); cursor: pointer; flex: none; }
.sidebar__alternar:hover { background: var(--superficie-2); color: var(--texto); }
.sidebar ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.sidebar a { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 12px; color: var(--texto-suave); text-decoration: none; white-space: nowrap; font-weight: 500; }
.sidebar a svg { flex: none; }
.sidebar a:hover { background: var(--superficie-2); color: var(--texto); text-decoration: none; }
.sidebar a.active { background: var(--primaria-suave); color: var(--primaria); }
.conteudo { padding: 32px; max-width: 1400px; width: 100%; box-sizing: border-box; min-width: 0; }
.sidebar--recolhida { width: 64px; padding: 24px 10px; }
.sidebar--recolhida .sidebar__topo { justify-content: center; }
.sidebar--recolhida .sidebar__marca, .sidebar--recolhida .sidebar__rotulo { display: none; }
.sidebar--recolhida a { justify-content: center; padding: 10px 0; }

.pagina__topo { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 28px; flex-wrap: wrap; }
.pagina__topo h1 { margin: 0; font-size: 2rem; font-weight: 700; letter-spacing: -0.02em; }
.sobretitulo { margin: 0 0 4px; color: var(--texto-suave); font-size: 0.95rem; }

.cartao { background: var(--superficie); border: 1px solid var(--borda); border-radius: var(--raio); padding: 20px; margin-bottom: 20px; box-shadow: var(--sombra); }
.cartao h2 { margin-top: 0; font-size: 1.05rem; font-weight: 600; }
.cartoes { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 8px; }
.cartao-numero { display: flex; align-items: center; gap: 14px; }
.cartao-numero__icone { flex: none; width: 44px; height: 44px; border-radius: 12px; display: grid; place-items: center; background: var(--primaria-suave); color: var(--primaria); }
.cartao-numero__texto { min-width: 0; }
.cartao-numero__rotulo { color: var(--texto-suave); margin: 0; font-size: 0.9rem; }
.cartao-numero__valor { font-size: 1.5rem; font-weight: 700; margin: 4px 0 0; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
.grade-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px; }

.form { display: grid; gap: 12px; max-width: 640px; }
.form--linha { display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap; max-width: none; }
.campo { display: grid; gap: 4px; }
.campo label { font-size: 0.85rem; color: var(--texto-suave); }
.campo--check { display: flex; gap: 8px; align-items: center; }
input, select, textarea { font: inherit; color: inherit; background: var(--superficie-2); border: 1px solid var(--borda); border-radius: var(--raio-controle); padding: 9px 12px; }
input:focus, select:focus, textarea:focus { outline: 2px solid var(--primaria); outline-offset: -1px; border-color: transparent; }
input[type='checkbox'], input[type='radio'] { accent-color: var(--primaria); }
[aria-invalid='true'] { border-color: var(--perigo); }
.campo__erro { color: var(--perigo); font-size: 0.85rem; margin: 0; }
.form__ajuda { font-size: 0.85rem; color: var(--texto-suave); margin: 4px 0 0; }
.form__ajuda--aviso { color: var(--perigo); }

.btn { font: inherit; font-weight: 500; cursor: pointer; border: 1px solid var(--borda); background: var(--superficie-2); color: var(--texto); border-radius: var(--raio-controle); padding: 8px 16px; text-decoration: none; display: inline-block; }
.btn:hover { border-color: var(--texto-suave); text-decoration: none; }
.btn:disabled { opacity: 0.6; cursor: wait; }
.btn--primario { background: var(--primaria); border-color: var(--primaria); color: var(--primaria-texto); font-weight: 600; }
.btn--primario:hover { background: var(--t1); border-color: var(--t1); }
.btn--perigo { color: var(--perigo); border-color: var(--perigo); background: transparent; }
.btn--fantasma { border-color: transparent; background: transparent; }
.btn--fantasma:hover { background: var(--superficie-2); border-color: transparent; }
.btn--pequeno { padding: 3px 10px; font-size: 0.85rem; }

.aviso { padding: 10px 14px; border-radius: var(--raio-controle); border: 1px solid var(--borda); background: var(--superficie); margin: 12px 0; }
.aviso--erro { border-color: var(--perigo); color: var(--perigo); background: rgb(248 113 113 / 0.08); white-space: pre-line; }
.aviso--ok { border-color: var(--ok); color: var(--ok); background: rgb(74 222 128 / 0.08); }
.vazio { color: var(--texto-suave); }
.busca { width: 100%; max-width: 420px; margin-bottom: 16px; }

.tabela { width: 100%; border-collapse: collapse; background: transparent; }
.tabela th, .tabela td { text-align: left; padding: 12px; border-bottom: 1px solid var(--borda); vertical-align: middle; }
.tabela th { font-size: 0.8rem; color: var(--texto-suave); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
.tabela tbody tr:hover td { background: rgb(255 255 255 / 0.02); }
.tabela .num { text-align: right; font-variant-numeric: tabular-nums; }
.lista { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
.lista li { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }

.etiqueta { font-size: 0.75rem; font-weight: 500; padding: 3px 10px; border-radius: 999px; border: 0; background: var(--superficie-2); color: var(--texto-suave); white-space: nowrap; }
.etiqueta--entregue, .etiqueta--paga, .etiqueta--publicado { color: var(--ok); background: rgb(74 222 128 / 0.12); }
.etiqueta--atrasada, .etiqueta--perdido { color: var(--perigo); background: rgb(248 113 113 / 0.12); }
.etiqueta--andamento, .etiqueta--agendado { color: var(--primaria); background: var(--primaria-suave); }
.etiqueta--proposta { color: var(--atencao); background: rgb(251 191 36 / 0.12); }
.item-atrasado { color: var(--perigo); font-weight: 600; }
.tabela__linha--inativa { opacity: 0.55; }
.tabela__divisoria td { padding: 4px 12px; font-size: 0.75rem; color: var(--texto-suave); border-bottom: 1px solid var(--borda); }

.abas { display: flex; gap: 4px; border-bottom: 1px solid var(--borda); margin-bottom: 20px; flex-wrap: wrap; }
.abas__aba { font: inherit; font-weight: 500; background: none; border: none; padding: 10px 14px; cursor: pointer; color: var(--texto-suave); border-bottom: 2px solid transparent; }
.abas__aba:hover { color: var(--texto); }
.abas__aba[aria-selected='true'] { color: var(--primaria); border-bottom-color: var(--primaria); }

.kanban { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(240px, 1fr); gap: 12px; overflow-x: auto; align-items: start; padding-bottom: 8px; }
.kanban__coluna { background: var(--superficie); border: 1px solid var(--borda); border-radius: var(--raio); padding: 12px; min-height: 120px; display: grid; gap: 8px; align-content: start; box-shadow: var(--sombra); }
.kanban__coluna--alvo { outline: 2px dashed var(--primaria); }
.kanban__coluna--recolhida { min-height: 0; }
.kanban__topo { display: flex; justify-content: space-between; align-items: center; }
.kanban__topo h2 { font-size: 0.95rem; margin: 0; }
.kanban__contagem { color: var(--texto-suave); font-weight: 400; }
.kanban__card { background: var(--superficie-2); border: 1px solid var(--borda); border-radius: 12px; padding: 10px 12px; display: grid; gap: 4px; cursor: grab; }
.kanban__card:hover { border-color: var(--t5); }
.kanban__titulo { font: inherit; font-weight: 600; text-decoration: none; color: var(--texto); background: none; border: none; padding: 0; text-align: left; cursor: pointer; }
.kanban__meta { margin: 0; font-size: 0.85rem; color: var(--texto-suave); }
.kanban__mover { font-size: 0.8rem; padding: 4px; }

.calendario { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
.calendario__cabecalho { font-size: 0.8rem; color: var(--texto-suave); text-align: center; }
.calendario__dia { background: var(--superficie); border: 1px solid var(--borda); border-radius: var(--raio-controle); min-height: 90px; padding: 6px; display: grid; gap: 4px; align-content: start; font-size: 0.85rem; }
.calendario__dia--fora { opacity: 0.45; }
.calendario__dia--hoje { border-color: var(--primaria); }
.calendario__item { font: inherit; font-size: 0.8rem; text-align: left; background: var(--primaria-suave); border: 0; border-radius: 6px; padding: 2px 6px; cursor: pointer; color: var(--texto); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.conteudo-layout { display: grid; grid-template-columns: 1fr 240px; gap: 16px; align-items: start; }

.imagens { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; margin-top: 12px; }
.imagens figure { margin: 0; display: grid; gap: 6px; }
.imagens img { width: 100%; aspect-ratio: 16 / 10; object-fit: cover; border-radius: var(--raio-controle); border: 1px solid var(--borda); }
.qrcode-preview { display: block; width: 100%; max-height: 420px; object-fit: contain; background: #fff; border-radius: var(--raio-controle); border: 1px solid var(--borda); margin-top: 12px; }
.slide { border-top: 1px solid var(--borda); padding-top: 12px; margin-top: 12px; }

.modal__fundo { position: fixed; inset: 0; background: rgb(0 0 0 / 0.65); backdrop-filter: blur(2px); display: grid; place-items: center; padding: 16px; z-index: 10; }
.modal { background: var(--superficie); border: 1px solid var(--borda); border-radius: var(--raio); padding: 24px; width: min(640px, 100%); max-height: 90vh; overflow: auto; box-shadow: 0 24px 64px rgb(0 0 0 / 0.6); }
.modal__topo { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.modal__topo h2 { margin: 0; font-size: 1.2rem; }

.barra { height: 8px; background: var(--primaria); border-radius: 999px; min-width: 2px; }
.saida { background: var(--superficie-2); padding: 12px; border-radius: var(--raio-controle); overflow-x: auto; white-space: pre-wrap; }
.diff { padding-left: 18px; }

@media (max-width: 760px) {
  .app { grid-template-columns: 1fr; }
  .sidebar, .sidebar--recolhida { position: static; height: auto; width: auto; padding: 12px 16px; border-right: 0; border-bottom: 1px solid var(--borda); }
  .sidebar__alternar { display: none; }
  .sidebar__topo { margin-bottom: 8px; }
  .sidebar--recolhida .sidebar__marca, .sidebar--recolhida .sidebar__rotulo { display: revert; }
  .sidebar ul { grid-auto-flow: column; overflow-x: auto; }
  .conteudo { padding: 16px; }
  .conteudo-layout { grid-template-columns: 1fr; }
  .pagina__topo h1 { font-size: 1.6rem; }
}
```

- [ ] **Step 2: Rodar a suíte inteira**

Run: `npx vitest run`
Expected: todos os testes passam (só CSS mudou).

- [ ] **Step 3: Olhada rápida no app**

Abrir `http://127.0.0.1:5173/` (Vite no pm2 recarrega o CSS sozinho). Expected: fundo preto, sidebar com item ativo em turquesa translúcido, cards arredondados. A conferência completa é na Task 4.

- [ ] **Step 4: Commit**

```bash
git add web/src/styles.css
git commit -m "feat: componentes no estilo escuro turquesa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Ícone nos cartões de número

**Files:**
- Modify: `web/src/components/Numero.jsx`
- Create: `web/src/components/Numero.test.jsx`
- Modify: `web/src/components/Icone.jsx` (novo desenho `alerta`)
- Modify: `web/src/pages/Inicio.jsx:46-55`

**Interfaces:**
- Consumes: classes `.cartao-numero`, `.cartao-numero__icone`, `.cartao-numero__texto` (Task 2); `Icone({ nome, tamanho })` existente.
- Produces: `Numero({ rotulo, icone?, children })` — `icone` é um nome de desenho de `Icone.jsx`; sem `icone`, markup igual ao de antes. Desenho `alerta` em `Icone.jsx`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `web/src/components/Numero.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Numero } from './Numero.jsx';

describe('Numero', () => {
  it('mostra rótulo e valor', () => {
    render(<Numero rotulo="Recebido">R$ 10,00</Numero>);
    expect(screen.getByText('Recebido')).toBeInTheDocument();
    expect(screen.getByText('R$ 10,00')).toBeInTheDocument();
  });

  it('sem ícone não desenha o quadrado do ícone', () => {
    const { container } = render(<Numero rotulo="Recebido">R$ 10,00</Numero>);
    expect(container.querySelector('.cartao-numero__icone')).toBeNull();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('com ícone desenha o ícone ao lado do valor', () => {
    const { container } = render(<Numero rotulo="Atrasadas" icone="alerta">2</Numero>);
    const caixa = container.querySelector('.cartao-numero__icone');
    expect(caixa).not.toBeNull();
    expect(caixa.querySelector('svg path')).not.toBeNull();
    expect(container.querySelector('.cartao-numero')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run web/src/components/Numero.test.jsx`
Expected: FAIL no terceiro teste (`.cartao-numero__icone` é `null`).

- [ ] **Step 3: Adicionar o desenho `alerta` em `Icone.jsx`**

Dentro de `DESENHOS`, logo antes do fechamento `};` (depois de `expandir`):

```jsx
  alerta: (
    <>
      <path d="M12 3.5 2.5 20h19z" />
      <path d="M12 10v4.5M12 17.5v.01" />
    </>
  ),
```

- [ ] **Step 4: Implementar a prop `icone` em `Numero.jsx`**

Substituir o arquivo por:

```jsx
import { Icone } from './Icone.jsx';

export function Numero({ rotulo, icone, children }) {
  if (!icone) {
    return (
      <div className="cartao">
        <p className="cartao-numero__rotulo">{rotulo}</p>
        <p className="cartao-numero__valor">{children}</p>
      </div>
    );
  }
  return (
    <div className="cartao cartao-numero">
      <span className="cartao-numero__icone"><Icone nome={icone} tamanho={22} /></span>
      <div className="cartao-numero__texto">
        <p className="cartao-numero__rotulo">{rotulo}</p>
        <p className="cartao-numero__valor">{children}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run web/src/components/Numero.test.jsx`
Expected: PASS (3 testes).

- [ ] **Step 6: Ícones nos cartões da Início**

Em `web/src/pages/Inicio.jsx`, substituir o bloco `<div className="cartoes"> … </div>` por:

```jsx
      <div className="cartoes">
        <Numero rotulo="A receber este mês" icone="financeiro">{formatarDinheiro(cartoes.a_receber_mes_centavos)}</Numero>
        <Numero rotulo="Parcelas atrasadas" icone="alerta">
          {cartoes.atrasadas.quantidade} · {formatarDinheiro(cartoes.atrasadas.total_centavos)}
        </Numero>
        <Numero rotulo="Projetos em andamento" icone="projetos">{cartoes.em_andamento}</Numero>
        <Numero rotulo="Propostas abertas" icone="funil">
          {cartoes.propostas.quantidade} · {formatarDinheiro(cartoes.propostas.total_centavos)}
        </Numero>
      </div>
```

(`AbaFinanceiro.jsx` continua sem ícones — fica como hoje.)

- [ ] **Step 7: Rodar a suíte inteira**

Run: `npx vitest run`
Expected: todos passam, incluindo `Inicio.test.jsx` e `AbaFinanceiro.test.jsx`.

- [ ] **Step 8: Commit**

```bash
git add web/src/components/Numero.jsx web/src/components/Numero.test.jsx web/src/components/Icone.jsx web/src/pages/Inicio.jsx
git commit -m "feat: icone nos cartoes de numero da inicio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Conferência visual no app real

**Files:**
- Modify (só se a conferência achar problema): `web/src/styles.css`

- [ ] **Step 1: Reiniciar o Vite para pegar a fonte nova**

Run: `pm2 restart crm-madia-web`
Expected: `crm-madia-web` volta `online`.

- [ ] **Step 2: Passar por todas as telas em `http://127.0.0.1:5173/`, em largura de desktop**

Checklist — em cada uma, nada de texto escuro sobre fundo escuro, nada de fundo claro sobrando, fonte Inter aplicada:
- Início (cartões com ícone, tarefas, "Próximos 7 dias" com etiqueta neutra legível)
- Funil (kanban, arrastar card, coluna-alvo tracejada, modal de nova oportunidade)
- Projetos e um projeto: abas Geral, Financeiro (cartões **sem** ícone, iguais a antes), Conteúdos, Divulgação, Portfólio (imagens)
- Clientes e um cliente
- QR Codes e um QR (pré-visualização com **fundo branco**)
- Placas: abas Resumo, Lotes, Modelos, Materiais, Vendas, Avarias (etiqueta de estoque negativo em vermelho)
- Conteúdo (calendário, dia de hoje com borda turquesa)
- Financeiro (etiquetas paga/atrasada)
- Configurações
- Controles nativos: abrir um `<select>`, um `<input type="date">` e marcar um checkbox — todos legíveis no escuro.
- Avisos de erro/ok (ex.: salvar um formulário inválido).

- [ ] **Step 3: Largura de celular**

No DevTools, largura 390px: sidebar vira faixa horizontal rolável, página sem rolagem horizontal, título menor.

- [ ] **Step 4: Corrigir o que aparecer**

Para cada problema, ajustar a regra correspondente em `web/src/styles.css` usando só tokens da Task 1 (nada de cor solta nova, exceto o `#fff` do QR). Rodar `npx vitest run` de novo.

- [ ] **Step 5: Commit (só se houve correção)**

```bash
git add web/src/styles.css
git commit -m "fix: ajustes do tema escuro apos conferencia visual

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
