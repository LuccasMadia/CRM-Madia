# Aba "Fictícios" no Funil — Design

## Contexto

Desde [[2026-09-25-projeto-ficticio-design]], projetos fictícios (`ficticio = 1`) somem do Funil — `web/src/pages/Funil.jsx` carrega `api('/projetos?ficticio=0')`. Isso tira a poluição do funil de vendas real, mas também deixou os fictícios sem nenhum lugar visual de acompanhamento: eles só aparecem hoje na lista de Projetos (misturados com os reais, sem filtro dedicado) e como cards de tarefa na Início. Não existe kanban nem qualquer visão de "estágio" pros fictícios.

O Lucca quer um lugar dedicado só pra fictícios, mantendo a ideia de estágio ("em andamento", "entregue") que já existe no campo `etapa`, sem misturar com o funil de vendas real.

## Escopo

O Funil ganha duas sub-abas no topo: **Reais** e **Fictícios**. Comportamento por aba:

- **Reais** (padrão, aba inicial): exatamente o que existe hoje — `GET /projetos?ficticio=0`, colunas `ETAPAS` completo (contato, proposta, andamento, entregue, perdido), "perdido" recolhida por padrão.
- **Fictícios**: `GET /projetos?ficticio=1`, só duas colunas — **Em andamento** e **Entregue** (nova constante `ETAPAS_FICTICIO`). Sem coluna recolhida (não existe "perdido" aqui).

Trocar de aba troca a fonte de dados e as colunas do `Kanban`, que já é agnóstico o suficiente pra isso (`colunas`, `itens`, `colunaDe` são props). Não é criado um componente Kanban novo.

**Criar oportunidade fictícia:** o botão "+ Oportunidade" abre o mesmo `FormOportunidade` de sempre. Duas mudanças de comportamento nesse form, sem duas versões do componente:

1. O `<select>` de etapa mostra `ETAPAS_FICTICIO` (só andamento/entregue) sempre que o checkbox "Projeto fictício" estiver marcado — reativo ao próprio estado do checkbox, não à aba de onde o form foi aberto. Desmarcando, volta a mostrar `ETAPAS` completo.
2. Quando o form é aberto a partir da aba Fictícios, ele recebe um valor inicial `ficticio: true` e o checkbox vem **desabilitado** (travado) — não dá pra desmarcar e criar sem querer um projeto real a partir dali. Aberto a partir da aba Reais, o checkbox continua como hoje: desmarcado e editável.

**Mover entre colunas:** drag-and-drop e o `<select>` de mover do card (dentro de `Kanban.jsx`) já usam a prop `colunas` recebida — na aba Fictícios, só oferecem andamento/entregue, sem mudança no componente.

**Sem mudança no backend.** `ficticio` já é filtro em `GET /projetos`. A restrição de etapas (andamento/entregue) é só uma limitação de UI: o backend continua aceitando qualquer `etapa` pra um projeto fictício, como já aceita hoje. Um projeto fictício antigo que porventura tenha `etapa` fora desse conjunto (ex.: criado antes desta mudança, ou editado direto na aba do projeto) simplesmente não aparece na aba Fictícios — mesmo comportamento que o `Kanban` já tem hoje para qualquer item cuja `colunaDe(item)` não bate com nenhuma das `colunas` exibidas. Não é esperado que isso aconteça na prática, já que a única forma de criar um fictício continua sendo esse mesmo formulário.

## Modelo de dados

Nenhuma mudança. `ficticio` e `etapa` já existem em `projetos`.

## Frontend

### `web/src/lib/rotulos.js`
Nova constante, ao lado de `ETAPAS`:

```js
export const ETAPAS_FICTICIO = ['andamento', 'entregue'];
```

(reaproveita `ROTULO_ETAPA` já existente — sem rótulos novos.)

### `web/src/pages/Funil.jsx`
- Novo estado `const [aba, setAba] = useState('reais');` (`'reais' | 'ficticios'`).
- `useCarregar` passa a depender da aba: `api(`/projetos?ficticio=${aba === 'ficticios' ? 1 : 0}`)`, com `[aba]` nas dependências.
- `COLUNAS` deixa de ser constante de módulo — vira `const colunas = (aba === 'ficticios' ? ETAPAS_FICTICIO : ETAPAS).map((id) => ({ id, titulo: ROTULO_ETAPA[id] }));` dentro do componente.
- `recolhidas` só se aplica na aba Reais: `recolhidas={aba === 'reais' ? ['perdido'] : []}`.
- Novo par de botões/abas no `<header>`, acima ou ao lado do título, estilo simples de toggle (reaproveitar classe existente de abas se houver no projeto; senão, dois `<button>` com classe `btn--fantasma` / ativo via `aria-pressed`).
- `criar()` e o botão "+ Oportunidade" passam a repassar a aba atual pro modal, pra pré-configurar o form (ver abaixo).

### `web/src/components/FormOportunidade.jsx`
- Novo prop opcional `ficticioFixo` (`boolean`, padrão `false`). Quando `true`: valor inicial de `ficticio` no `useFormulario` é `true`, e o checkbox é renderizado com `disabled`.
- O `<select>` de etapa passa a mapear `(valores.ficticio ? ETAPAS_FICTICIO : ETAPAS)` em vez de `ETAPAS` fixo. Quando `valores.ficticio` muda de `false` para `true` e a `etapa` atual não está em `ETAPAS_FICTICIO` (ex.: estava em "proposta"), resetar `etapa` para `'andamento'` (evita mandar um valor que sumiu do select).
- `Funil.jsx` passa `<FormOportunidade onSalvar={criar} ficticioFixo={aba === 'ficticios'} />`.

## Fora de escopo

- Lista de Projetos (tabela) e detalhe do projeto — continuam sem sub-abas, mostrando tudo misturado, como hoje.
- Qualquer validação no backend restringindo `etapa` de projetos fictícios.
- Migrar/corrigir projetos fictícios existentes que estejam fora de andamento/entregue.

## Testes

- `web/src/pages/Funil.test.jsx`:
  - Aba "Reais" por padrão ao carregar a página, chamando `GET /projetos?ficticio=0` (mock já existente, só confirmar que continua valendo com o estado inicial).
  - Clicar na aba "Fictícios" dispara `GET /projetos?ficticio=1` e renderiza só as colunas "Em andamento" e "Entregue" (sem "Contato", "Proposta enviada", "Perdido").
  - Abrir "+ Oportunidade" a partir da aba Fictícios: o checkbox "Projeto fictício" vem marcado e desabilitado, e o select de etapa só lista Em andamento/Entregue.
  - Abrir "+ Oportunidade" a partir da aba Reais, marcar manualmente o checkbox "Projeto fictício": o select de etapa passa a listar só Em andamento/Entregue.
  - Mover um card na aba Fictícios chama `PUT /projetos/:id` com a nova etapa, igual ao fluxo já testado na aba Reais.
