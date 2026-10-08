# Pagamento Pix direto no banco (Web Share) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o QR da página pública `/pix/:id` por um botão "Pagar com Pix" que usa a Web Share API pra mandar o código Pix direto pro app do banco, com copia-e-cola como rede de segurança.

**Architecture:** Mudança isolada em um único componente React (`PixPage.jsx`) no repositório do Portfólio. Feature-detection de `navigator.share` decide entre mostrar o botão "Pagar com Pix" (mobile) ou só o copia-e-cola (desktop). Nenhuma mudança no CRM-Madia, no backend, ou no formato de `src/data/pix.json`.

**Tech Stack:** React 19, Vitest + Testing Library (já configurados no repo do Portfólio), Web Share API (`navigator.share`) e Clipboard API (`navigator.clipboard.writeText`), ambas nativas do navegador (sem dependência nova).

## Global Constraints

- Repositório alvo de todos os arquivos deste plano: `C:\Users\lucca\Documents\Projetos\0. Luccas Madia (eu)\Portifolio Luccas Madia` (NÃO é o repo CRM-Madia).
- Esse repositório já tem mudanças não commitadas e **não relacionadas** a esta feature (`src/components/Header/Header.css`, `src/components/Hero/Hero.css`, `src/index.css`). Nunca usar `git add -A` ou `git add .` — sempre `git add` com os caminhos exatos listados em cada task.
- O texto compartilhado via `navigator.share` deve ser **só o código Pix puro** (`{ text: codigo }`), sem título/URL, pra não quebrar a detecção de Pix pelo app do banco.
- `AbortError` do `navigator.share` (usuário cancelou o menu de compartilhamento) nunca deve mostrar mensagem de erro.
- QR code (`qrcode.react`) sai completamente da página e do `package.json` — não é renderizado em nenhum cenário.

---

### Task 1: Trocar QR por botão "Pagar com Pix" na PixPage

**Files:**
- Modify: `C:\Users\lucca\Documents\Projetos\0. Luccas Madia (eu)\Portifolio Luccas Madia\src\pages\PixPage.jsx`
- Modify: `C:\Users\lucca\Documents\Projetos\0. Luccas Madia (eu)\Portifolio Luccas Madia\src\pages\PixPage.css`
- Test: `C:\Users\lucca\Documents\Projetos\0. Luccas Madia (eu)\Portifolio Luccas Madia\src\pages\PixPage.test.jsx`

**Interfaces:**
- Consumes: `pixData` de `../data/pix.json` (formato inalterado: `{ [id]: { nome, codigo } }`); `useParams()` do `react-router-dom`.
- Produces: nada consumido por outras tasks além do próprio arquivo — Task 2 só toca `package.json`/lockfile e depende de `qrcode.react` já não ser importado em nenhum arquivo (garantido por esta task).

- [ ] **Step 1: Substituir o conteúdo do teste por um que cobre os cenários novos**

Substituir todo o conteúdo de `PixPage.test.jsx` por:

```jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PixPage } from './PixPage';

vi.mock('../data/pix.json', () => ({
  default: { 42: { nome: 'Popy', codigo: '00020126...CODIGO...6304ABCD' } },
}));

function renderizarEm(id) {
  return render(
    <MemoryRouter initialEntries={[`/pix/${id}`]}>
      <Routes>
        <Route path="/pix/:id" element={<PixPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PixPage', () => {
  afterEach(() => {
    delete navigator.share;
  });

  it('mostra o nome e o código quando o id existe', () => {
    renderizarEm('42');
    expect(screen.getByText('Popy')).toBeInTheDocument();
    expect(screen.getByText('00020126...CODIGO...6304ABCD')).toBeInTheDocument();
  });

  it('copia o código ao clicar em Copiar', async () => {
    renderizarEm('42');
    const user = userEvent.setup();
    const escrever = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    await user.click(screen.getByRole('button', { name: 'Copiar' }));
    expect(escrever).toHaveBeenCalledWith('00020126...CODIGO...6304ABCD');
  });

  it('mostra mensagem de não encontrado quando o id não existe', () => {
    renderizarEm('999');
    expect(screen.getByText('Código Pix não encontrado.')).toBeInTheDocument();
  });

  it('sem suporte a Web Share, não mostra o botão Pagar com Pix', () => {
    renderizarEm('42');
    expect(screen.queryByRole('button', { name: 'Pagar com Pix' })).not.toBeInTheDocument();
  });

  it('com suporte a Web Share, copia o código e compartilha ao clicar em Pagar com Pix', async () => {
    navigator.share = vi.fn().mockResolvedValue(undefined);
    renderizarEm('42');
    const user = userEvent.setup();
    const escrever = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    await user.click(screen.getByRole('button', { name: 'Pagar com Pix' }));
    expect(escrever).toHaveBeenCalledWith('00020126...CODIGO...6304ABCD');
    expect(navigator.share).toHaveBeenCalledWith({ text: '00020126...CODIGO...6304ABCD' });
  });

  it('não mostra erro quando o usuário cancela o compartilhamento', async () => {
    const erroAbort = new Error('cancelado');
    erroAbort.name = 'AbortError';
    navigator.share = vi.fn().mockRejectedValue(erroAbort);
    renderizarEm('42');
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    await user.click(screen.getByRole('button', { name: 'Pagar com Pix' }));
    expect(screen.queryByText(/Não foi possível abrir o compartilhamento/)).not.toBeInTheDocument();
  });

  it('mostra mensagem de fallback quando o compartilhamento falha por outro motivo', async () => {
    navigator.share = vi.fn().mockRejectedValue(new Error('falhou'));
    renderizarEm('42');
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    await user.click(screen.getByRole('button', { name: 'Pagar com Pix' }));
    expect(await screen.findByText(/Não foi possível abrir o compartilhamento/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar as falhas esperadas**

Run (dentro de `Portifolio Luccas Madia`): `npm test -- src/pages/PixPage.test.jsx`

Expected: FAIL — os testes "sem suporte a Web Share", "com suporte a Web Share...", "não mostra erro..." e "mostra mensagem de fallback..." falham porque o botão "Pagar com Pix" ainda não existe no componente atual.

- [ ] **Step 3: Reescrever `PixPage.jsx`**

Substituir todo o conteúdo por:

```jsx
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import pixData from '../data/pix.json';
import './PixPage.css';

export function PixPage() {
  const { id } = useParams();
  const entrada = pixData[id];
  const [erroCompartilhar, setErroCompartilhar] = useState(false);
  const podeCompartilhar = typeof navigator.share === 'function';

  if (!entrada) {
    return (
      <main className="pix-page pix-page--vazia">
        <p>Código Pix não encontrado.</p>
      </main>
    );
  }

  async function copiar() {
    await navigator.clipboard.writeText(entrada.codigo);
  }

  async function pagar() {
    setErroCompartilhar(false);
    try {
      await navigator.clipboard.writeText(entrada.codigo);
    } catch {
      // clipboard pode não estar disponível; segue tentando compartilhar
    }
    try {
      await navigator.share({ text: entrada.codigo });
    } catch (erro) {
      if (erro?.name !== 'AbortError') {
        setErroCompartilhar(true);
      }
    }
  }

  return (
    <main className="pix-page">
      <h1>{entrada.nome}</h1>
      {podeCompartilhar && (
        <button type="button" className="btn btn--primary" onClick={pagar}>Pagar com Pix</button>
      )}
      {erroCompartilhar && (
        <p className="pix-page__erro">
          Não foi possível abrir o compartilhamento. O código já foi copiado — abra seu banco e cole.
        </p>
      )}
      <p className="pix-page__instrucao">
        {podeCompartilhar
          ? 'Se seu banco não detectar automaticamente, cole o código na opção "Pix Copia e Cola".'
          : 'Abra o Pix no app do seu banco e cole o código na opção "Pix Copia e Cola".'}
      </p>
      <code className="pix-page__codigo">{entrada.codigo}</code>
      <button type="button" className="btn btn--outline" onClick={copiar}>Copiar</button>
    </main>
  );
}
```

- [ ] **Step 4: Atualizar `PixPage.css`**

Substituir todo o conteúdo por:

```css
.pix-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 2rem 1.5rem;
  text-align: center;
}

.pix-page--vazia {
  color: var(--text-muted);
}

.pix-page__instrucao {
  color: var(--text-muted);
  max-width: 320px;
}

.pix-page__erro {
  color: var(--accent);
  max-width: 320px;
}

.pix-page__codigo {
  display: block;
  max-width: 320px;
  word-break: break-all;
  background: var(--bg-alt);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.75rem 1rem;
  font-size: 0.8rem;
  color: var(--text-muted);
}
```

- [ ] **Step 5: Rodar os testes de novo e confirmar que passam**

Run: `npm test -- src/pages/PixPage.test.jsx`
Expected: PASS (7 testes).

- [ ] **Step 6: Commit**

```bash
cd "C:\Users\lucca\Documents\Projetos\0. Luccas Madia (eu)\Portifolio Luccas Madia"
git add src/pages/PixPage.jsx src/pages/PixPage.css src/pages/PixPage.test.jsx
git commit -m "feat: pagamento Pix direto via Web Share, remove QR da pagina publica"
```

---

### Task 2: Remover a dependência `qrcode.react`

**Files:**
- Modify: `C:\Users\lucca\Documents\Projetos\0. Luccas Madia (eu)\Portifolio Luccas Madia\package.json`
- Modify: `C:\Users\lucca\Documents\Projetos\0. Luccas Madia (eu)\Portifolio Luccas Madia\package-lock.json`

**Interfaces:**
- Consumes: nenhuma importação de `qrcode.react` deve existir em nenhum arquivo do repo (garantido pela Task 1 — `PixPage.jsx` não importa mais `QRCodeSVG`).
- Produces: nada — última task do plano.

- [ ] **Step 1: Confirmar que não há mais nenhuma referência a `qrcode.react` no código-fonte**

Run (dentro de `Portifolio Luccas Madia`): `grep -r "qrcode.react" src`
Expected: nenhuma saída (sem matches).

- [ ] **Step 2: Remover a dependência**

Run: `npm uninstall qrcode.react`
Expected: comando atualiza `package.json` (remove a linha `"qrcode.react": "^4.2.0"`) e `package-lock.json`.

- [ ] **Step 3: Rodar a suíte de testes completa**

Run: `npm test`
Expected: PASS em todos os testes (incluindo os 7 de `PixPage.test.jsx` da Task 1).

- [ ] **Step 4: Rodar o build pra garantir que nada mais referencia a dependência removida**

Run: `npm run build`
Expected: build conclui sem erros.

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\lucca\Documents\Projetos\0. Luccas Madia (eu)\Portifolio Luccas Madia"
git add package.json package-lock.json
git commit -m "chore: remove dependencia qrcode.react, nao usada mais na pagina do Pix"
```
