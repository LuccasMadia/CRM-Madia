# Unificar Portfólio + Conteúdos em "Divulgação" — Design

## Contexto

Hoje a edição de projeto (`web/src/pages/projeto/Projeto.jsx`) tem cinco abas: Visão geral, Tarefas, Financeiro, Portfólio e Conteúdos.

- **Portfólio** (`AbaPortfolio.jsx`) gerencia o que aparece no site público: dados públicos (publicar, slug, título, descrição, stack, links), imagens e case study.
- **Conteúdos** (`AbaConteudos.jsx`) lista os conteúdos planejados/publicados ligados ao projeto — de qualquer canal (`instagram` ou `portfolio`, ver `ROTULO_CANAL` em `lib/rotulos.js`) — e permite criar/editar/excluir via modal.

São dois assuntos que na prática andam juntos (planejar o que divulgar e gerenciar a página pública), mas hoje exigem trocar de aba. O Lucca quer as duas juntas em um só lugar.

## Escopo

Substituir as abas "Portfólio" e "Conteúdos" por uma única aba **"Divulgação"**, que mostra:

1. A lista de conteúdos do projeto (todos os canais, sem filtro) — topo da aba.
2. A gestão do portfólio público (dados públicos, imagens, case study) — abaixo.

Implementação por composição, sem duplicar lógica: novo componente `web/src/pages/projeto/AbaDivulgacao.jsx` que renderiza `<AbaConteudos projetoId={projeto.id} />` seguido de `<AbaPortfolio projeto={projeto} />`. Nenhum dos dois componentes existentes muda por dentro.

## Navegação

Em `Projeto.jsx`, o array `ABAS` passa de:

```js
[
  ['geral', 'Visão geral'],
  ['tarefas', 'Tarefas'],
  ['financeiro', 'Financeiro'],
  ['portfolio', 'Portfólio'],
  ['conteudos', 'Conteúdos'],
]
```

para:

```js
[
  ['geral', 'Visão geral'],
  ['tarefas', 'Tarefas'],
  ['financeiro', 'Financeiro'],
  ['divulgacao', 'Divulgação'],
]
```

O painel correspondente troca as duas renderizações condicionais (`aba === 'portfolio'` e `aba === 'conteudos'`) por uma só: `aba === 'divulgacao' && <AbaDivulgacao projeto={projeto} />`.

## Componente novo

```jsx
// web/src/pages/projeto/AbaDivulgacao.jsx
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

Cada seção continua em seu próprio `<div className="cartao">` (já é assim em ambos os componentes), então a separação visual entre "lista de conteúdos" e "dados do portfólio" fica clara mesmo estando na mesma aba.

## Fora de escopo

- Qualquer mudança de comportamento dentro de `AbaConteudos.jsx` ou `AbaPortfolio.jsx` (filtros, campos, endpoints). Ambos continuam exatamente como estão hoje.
- Filtrar a lista de conteúdos por canal dentro da aba unificada — continua mostrando todos os canais, como hoje.
- Mudanças de backend — nenhum endpoint muda.

## Testes

- `AbaConteudos.test.jsx` e `AbaPortfolio.test.jsx` continuam válidos sem alteração (testam os componentes de forma isolada, como já fazem).
- Novo `web/src/pages/projeto/AbaDivulgacao.test.jsx`: mocka `GET /conteudos?projeto_id=` e `GET /projetos/:id/portfolio`, renderiza `AbaDivulgacao` e confirma que tanto o cabeçalho "Conteúdos deste projeto" quanto "Dados públicos" aparecem juntos na tela.
- `Projeto.test.jsx`: não referencia os nomes das abas hoje (conferido), então não precisa de alteração.
