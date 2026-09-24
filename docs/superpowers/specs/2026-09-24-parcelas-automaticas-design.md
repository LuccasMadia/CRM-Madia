# Geração automática de parcelas — Design

**Data:** 2026-09-24
**Status:** aguardando revisão

## 1. Objetivo

Hoje a aba Financeiro do projeto (`AbaFinanceiro.jsx`) só permite cadastrar parcelas uma a uma. Duas situações comuns ficam manuais e repetitivas:

1. **Parcelamento fixo conhecido de antemão** — ex.: "10 parcelas de R$500, vencendo todo dia 10, começando em abril/2026".
2. **Projetos com mensalidade recorrente** — ex.: manutenção mensal, que se repete indefinidamente até o cliente cancelar ou o projeto ser pausado.

Este design cobre as duas funcionalidades porque compartilham a mesma lógica de data (dia fixo de vencimento + avanço de mês com *clamp* de fim de mês) e a mesma área da UI.

### Fora do escopo

- Frequências diferentes de mensal (semanal, quinzenal) no parcelamento em lote.
- Geração retroativa de meses perdidos na mensalidade (se o app ficar tempo sem abrir, só a parcela do mês atual é gerada quando abrir de novo).
- Histórico de períodos de ativação/pausa da mensalidade — é um liga/desliga simples.
- Reajuste automático de valor da mensalidade ao longo do tempo.
- Qualquer agendador/cron — o projeto roda localmente sem infraestrutura de background job; a geração acontece sob demanda quando a tela é aberta.

## 2. Parcelamento em lote

### Backend

Novo endpoint `POST /projetos/:id/parcelas/lote`, em `server/routes/parcelas.js`, recebendo:

```json
{ "quantidade": 10, "valor_centavos": 50000, "primeira_vencimento": "2026-04-10" }
```

Regras de validação (`REGRAS_LOTE`): `quantidade` inteiro, obrigatório, `min: 1`, `max: 60`; `valor_centavos` inteiro, obrigatório, `min: 1`; `primeira_vencimento` data obrigatória. O validador genérico (`server/http/validar.js`) ganha suporte a `max` no tipo `inteiro`, no mesmo padrão de `min`.

Gera `quantidade` parcelas dentro de `emTransacao` (`server/repos/crud.js`):
- `descricao`: `"Parcela {i}/{quantidade}"` (1-indexado)
- `vencimento`: `somarMeses(primeira_vencimento, i - 1)`
- `valor_centavos`: fixo, repetido em todas

Responde `201` com a lista das parcelas criadas (mesmo formato do `GET`, com `estado` calculado).

### Novo helper de data

Em `server/domain/datas.js`, ao lado de `somarDias`:

```js
somarMeses(iso, meses) // soma meses a uma data ISO, preservando o dia;
                        // se o mês de destino não tiver esse dia (ex: 31 em abril),
                        // usa o último dia do mês de destino.
```

### Frontend (`AbaFinanceiro.jsx`)

Dentro do `cartao` que já existe, acima da tabela de parcelas: seção "Gerar parcelas em lote" com 3 campos — Quantidade, Valor de cada parcela (R$), Vencimento da 1ª parcela — e botão "Gerar". Sem campo de descrição (é automática). Usa um `useFormulario` próprio e o mesmo padrão de `envio`/`acao`/`recarregar()` já usado no form de parcela avulsa.

## 3. Mensalidade recorrente

### Modelo de dados (migração `002_mensalidade.sql`)

```sql
ALTER TABLE projetos ADD COLUMN mensalidade_ativa INTEGER NOT NULL DEFAULT 0 CHECK (mensalidade_ativa IN (0, 1));
ALTER TABLE projetos ADD COLUMN mensalidade_valor_centavos INTEGER NOT NULL DEFAULT 0 CHECK (mensalidade_valor_centavos >= 0);
ALTER TABLE projetos ADD COLUMN mensalidade_dia_vencimento INTEGER CHECK (mensalidade_dia_vencimento IS NULL OR (mensalidade_dia_vencimento BETWEEN 1 AND 31));
ALTER TABLE parcelas ADD COLUMN mensalidade INTEGER NOT NULL DEFAULT 0 CHECK (mensalidade IN (0, 1));
```

`parcelas.mensalidade` marca quais parcelas foram geradas automaticamente por essa regra, para não confundir com uma parcela avulsa que caia por coincidência no mesmo mês.

`repos/projetos.js` (`CAMPOS_PROJETO`) e `routes/projetos.js` (`REGRAS_PROJETO`) ganham os 3 campos novos de projeto. `routes/parcelas.js` (lista de campos do `criarRepo`) ganha `mensalidade`.

### Validação cruzada

Em `POST /projetos` e `PUT /projetos/:id`: se o estado final do projeto tem `mensalidade_ativa` verdadeiro, `mensalidade_valor_centavos` (> 0) e `mensalidade_dia_vencimento` (1–31) passam a ser obrigatórios. Erros de validação seguem o formato já usado (`ErroValidacao` com `{ campo, mensagem }`).

### Aba Geral (`AbaGeral.jsx`)

Checkbox "Cobra mensalidade". Quando marcado, revela dois campos: "Valor da mensalidade (R$)" e "Dia de vencimento" (número, 1–31). Enviado junto do resto do form no mesmo `PUT /projetos/:id` que já existe.

### Geração automática

No handler `GET /projetos/:id/parcelas` (`server/routes/parcelas.js`), antes de montar a resposta:

1. Se `projeto.mensalidade_ativa` é falso, não faz nada.
2. Calcula `mesAtual = mesDe(hoje())`.
3. Se já existe, na lista de parcelas do projeto, alguma com `mensalidade = 1` cujo `mesDe(vencimento) === mesAtual`, não faz nada (idempotente).
4. Caso contrário, cria uma parcela: `descricao: 'Mensalidade'`, `valor_centavos: projeto.mensalidade_valor_centavos`, `vencimento` no dia configurado dentro do mês atual (mesmo *clamp* de fim de mês do `somarMeses`, via um helper `dataNoMes(anoMes, dia)` em `domain/datas.js`), `mensalidade: 1`.
5. Recarrega a lista antes de responder, para a parcela recém-criada já aparecer.

Desativar a mensalidade (`mensalidade_ativa = false`) só impede novas gerações dali pra frente. Parcelas já criadas continuam no histórico normalmente — não são excluídas nem marcadas de outra forma.

### Efeito colateral aceito

Como a mensalidade gera parcelas indefinidamente, a soma das parcelas pode ultrapassar `valor_total_centavos` do projeto ao longo do tempo. Isso já é tratado pela UI existente (`resumo.nao_parcelado_centavos` negativo vira "Parcelas acima do valor" em `AbaFinanceiro.jsx`) — nenhuma mudança adicional necessária.

## 4. Testes

- `server/routes/parcelas.test.js`: geração em lote (quantidade, sequência mensal correta, *clamp* de dia 31→28/29/30, validação de quantidade/valor/data inválidos); geração automática de mensalidade (cria na primeira consulta do mês, não duplica em consultas seguintes, respeita `mensalidade_ativa = false`, *clamp* de dia de vencimento em mês curto).
- `server/domain` (novo teste ou extensão de um existente): `somarMeses` e `dataNoMes`, incluindo casos de borda de fim de mês.
- `server/routes/projetos.test.js`: validação cruzada de mensalidade ativa sem valor/dia.
