# Perfil do cliente por serviço + Funil só sites e sistemas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Todo serviço (Site/Sistema, Google Meu Negócio, Placas NFC) vira um `projeto` com tipo; GMN e placas são controlados por abas no perfil do cliente, e Funil/Projetos passam a mostrar só sites e sistemas.

**Architecture:** Coluna `projetos.servico` + regras por tipo validadas na rota de projetos (função pura em `server/domain/servicos.js`). Cobrança única de GMN/placas é sincronizada com uma parcela "Pagamento" por uma função pura (`server/domain/cobranca.js`). O perfil do cliente (`/clientes/:id`) ganha abas por serviço (`?aba=sites|gmn|placas`), cada uma em um arquivo em `web/src/pages/cliente/`.

**Tech Stack:** Node 24 (`node:sqlite`), Express 5, React 19, react-router 8, Vitest 5 (+ supertest no servidor, Testing Library + jsdom na web).

**Spec:** `docs/superpowers/specs/2026-10-15-perfil-cliente-por-servico-design.md`

## Global Constraints

- Valores de `servico`: exatamente `site_sistema`, `google_meu_negocio`, `placas_nfc`; padrão `site_sistema`.
- Etapas de GMN e placas: só `andamento` (Pendente) e `entregue` (Configurado / Entregue); criação sempre em `andamento`.
- Linhas de serviço: site → só `sistemas`/`saas`; GMN → nenhuma; placas → exatamente uma `placas_nfc`.
- Mensagens de erro exatas: `{campo: 'servico', mensagem: 'Não é possível mudar o tipo de serviço'}`, `{campo: 'qrcodes', mensagem: 'QR não pertence a este cliente'}`, `{campo: 'servicos', mensagem: 'Venda já entregue: modelo, quantidade e valor não podem mudar'}`.
- Parcela da cobrança única tem descrição `"Pagamento"`; com mais de uma parcela avulsa (não-mensalidade) a sincronização não mexe em nada.
- Abas do perfil: `?aba=sites|gmn|placas`, padrão `sites`; rótulos "Sites e Sistemas (n)", "Google Meu Negócio (n)", "Placas NFC (n)".
- QR codes aparecem rotulados como `#id nome`.
- Interface em português, sem jargão; commits em Conventional Commits terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Rodar testes com `npx vitest run <arquivo>` na raiz do repositório. Depois de mexer no servidor/migration, o app real só reflete após `pm2 restart crm-madia-api` (não há watch).

## Review Focus

1. Reenviar o formulário de uma venda de placas **já entregue** com a mesma linha (modelo/quantidade/valor iguais) não pode dar 400 nem duplicar a linha (o que geraria uma segunda venda numa nova entrega) — teste na Task 5.
2. Excluir em Placas › Vendas uma venda ligada a um serviço do perfil deve responder 409 com mensagem clara, não erro 500 de chave estrangeira — teste na Task 5.
3. Marcar GMN como configurado (`PUT {etapa: 'entregue'}`, sem `vencimento`) quando a parcela foi apagada no Financeiro não pode dar 400 nem criar parcela sem data — teste na Task 4.
4. GMN/placas entregues não podem gerar "Postar no Instagram" / "Publicar no portfólio" no Início — teste na Task 8.
5. Trocar um GMN de cobrança única para mensalidade remove a parcela única ainda não paga (sem cobrar em dobro), e uma parcela já paga nunca é alterada — teste na Task 4.

---

## Mapa de arquivos

**Servidor**
- Create `server/db/migrations/015_projetos_servico.sql` — coluna `servico`, `link_perfil`, tabela `projetos_qrcodes`.
- Modify `server/domain/servicos.js` — `SERVICOS`, `LINHAS_SITE`, `errosDoServico()`.
- Create `server/domain/cobranca.js` — `planejarCobrancaUnica()`.
- Create `server/repos/parcelas.js` — repo de parcelas compartilhado (`listarAvulsas`).
- Create `server/repos/projetosQrcodes.js` — ligações projeto↔QR.
- Modify `server/repos/projetos.js` — campos novos e filtro `servico`.
- Modify `server/repos/servicos.js` — `projetoDaVenda()`.
- Modify `server/repos/placas.js` — `listarAvulsasDoCliente()`.
- Modify `server/routes/projetos.js` — regras por tipo, QRs, cobrança, trava de venda entregue.
- Modify `server/routes/parcelas.js` — usa repo compartilhado; `servico`/`cliente_id` e `?servico=`.
- Modify `server/routes/clientes.js` — `GET /clientes/:id/placas`.
- Modify `server/routes/placas.js` — 409 ao excluir venda ligada.
- Modify `server/routes/painel.js` + `server/domain/painel.js` — só sites nos contadores, `para_entregar`, contexto da parcela.

**Web**
- Modify `web/src/lib/rotulos.js` — `ROTULO_SERVICO`, `SERVICOS`, `TIPOS_SERVICO_SITE`, `ABA_DO_SERVICO`.
- Modify `web/src/components/CamposServicos.jsx` — só Sistemas e SaaS.
- Modify `web/src/components/FormOportunidade.jsx`, `web/src/pages/projeto/AbaGeral.jsx`, `web/src/pages/Funil.jsx`, `web/src/pages/Projetos.jsx`.
- Rewrite `web/src/pages/ClienteDetalhe.jsx` — topo + abas.
- Create `web/src/pages/cliente/AbaSites.jsx`, `AbaGmn.jsx`, `AbaPlacas.jsx`, `CobrancaServico.jsx`.
- Create `web/src/hooks/useParcelas.js`, `web/src/hooks/usePrecoSugeridoPlacas.js`.
- Create `web/src/components/FormGmn.jsx`, `web/src/components/FormVendaPlacas.jsx`.
- Modify `web/src/pages/QRCodes.jsx`, `web/src/pages/QRCodeDetalhe.jsx`, `web/src/pages/Financeiro.jsx`, `web/src/pages/Inicio.jsx`.

---

### Task 1: Migration `015` e filtro `?servico=`

**Files:**
- Create: `server/db/migrations/015_projetos_servico.sql`
- Modify: `server/domain/servicos.js`
- Modify: `server/repos/projetos.js`
- Modify: `server/routes/projetos.js` (rota `GET /`)
- Test: `server/routes/projetos.test.js`

**Interfaces:**
- Produces: `SERVICOS` (array) exportado de `server/domain/servicos.js`; `projetos.servico` e `projetos.link_perfil` gravados por `repoProjetos`; `listarComCliente({ servico })`; tabela `projetos_qrcodes(projeto_id, qrcode_id)`.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao fim de `server/routes/projetos.test.js`:

```js
describe('/api/projetos — tipo de serviço', () => {
  it('projeto sem servico fica site_sistema', async () => {
    const res = await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Site' }).expect(201);
    expect(res.body).toMatchObject({ servico: 'site_sistema', link_perfil: null });
  });

  it('a migration cria a tabela de ligações projeto/QR', () => {
    const colunas = ctx.db.prepare('PRAGMA table_info(projetos_qrcodes)').all().map((c) => c.name);
    expect(colunas).toEqual(['projeto_id', 'qrcode_id']);
  });

  it('filtra por ?servico= e rejeita valor desconhecido', async () => {
    await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Site' }).expect(201);
    ctx.db.prepare(`INSERT INTO projetos (cliente_id, titulo, etapa, servico, criado_em, atualizado_em)
      VALUES (?, 'GMN', 'andamento', 'google_meu_negocio', 'x', 'x')`).run(cliente.id);
    const sites = (await ctx.http.get('/api/projetos?servico=site_sistema').expect(200)).body;
    expect(sites.map((p) => p.titulo)).toEqual(['Site']);
    const gmn = (await ctx.http.get('/api/projetos?servico=google_meu_negocio').expect(200)).body;
    expect(gmn.map((p) => p.titulo)).toEqual(['GMN']);
    expect((await ctx.http.get('/api/projetos').expect(200)).body).toHaveLength(2);
    await ctx.http.get('/api/projetos?servico=nada').expect(400);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run server/routes/projetos.test.js -t "tipo de serviço"`
Expected: FAIL (`servico` indefinido / tabela inexistente).

- [ ] **Step 3: Implementar**

`server/db/migrations/015_projetos_servico.sql`:

```sql
ALTER TABLE projetos ADD COLUMN servico TEXT NOT NULL DEFAULT 'site_sistema'
  CHECK (servico IN ('site_sistema', 'google_meu_negocio', 'placas_nfc'));
ALTER TABLE projetos ADD COLUMN link_perfil TEXT;
CREATE INDEX idx_projetos_servico ON projetos(servico);

CREATE TABLE projetos_qrcodes (
  projeto_id INTEGER NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
  qrcode_id INTEGER NOT NULL REFERENCES qrcodes(id) ON DELETE CASCADE,
  PRIMARY KEY (projeto_id, qrcode_id)
);
```

`server/domain/servicos.js` — adicionar no topo, depois de `TIPOS_SERVICO`:

```js
export const SERVICOS = ['site_sistema', 'google_meu_negocio', 'placas_nfc'];
export const LINHAS_SITE = ['sistemas', 'saas'];
```

`server/repos/projetos.js`:
- em `CAMPOS_PROJETO`, acrescentar `'servico', 'link_perfil'` ao fim da lista;
- `listarComCliente({ etapa, cliente_id, postou_instagram, ficticio, servico } = {})` e, junto dos outros filtros:

```js
      if (servico) {
        condicoes.push('p.servico = ?');
        args.push(servico);
      }
```

`server/routes/projetos.js`:
- importar `ErroHttp` de `../http/erros.js` (junto de `ErroValidacao, naoEncontrado`) e `SERVICOS` de `../domain/servicos.js`;
- substituir a rota `GET /`:

```js
  r.get('/', (req, res) => {
    const { servico } = req.query;
    if (servico && !SERVICOS.includes(servico)) throw new ErroHttp(400, 'Serviço inválido');
    res.json(projetos.listarComCliente({
      etapa: req.query.etapa,
      cliente_id: req.query.cliente_id,
      postou_instagram: req.query.postou_instagram,
      ficticio: req.query.ficticio,
      servico,
    }).map(comServicos));
  });
```

- [ ] **Step 4: Rodar e ver passar (e o resto do servidor continua verde)**

Run: `npx vitest run --project server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/db/migrations/015_projetos_servico.sql server/domain/servicos.js server/repos/projetos.js server/routes/projetos.js server/routes/projetos.test.js
git commit -m "feat: coluna servico em projetos e filtro por tipo de servico"
```

---

### Task 2: Regras por tipo de serviço

**Files:**
- Modify: `server/domain/servicos.js`
- Test: `server/domain/servicos.test.js`
- Modify: `server/routes/projetos.js` (`REGRAS_PROJETO`, `POST /`, `PUT /:id`)
- Test: `server/routes/projetos.test.js`

**Interfaces:**
- Consumes: `SERVICOS`, `LINHAS_SITE` (Task 1).
- Produces: `errosDoServico({ servico, etapa, ficticio, tiposLinhas, criando }) → Array<{campo, mensagem}>`; dentro de `rotasProjetos`, `exigirRegrasDoServico(contexto)` e `prepararDados` (POST). `POST /projetos` aceita `servico` e `link_perfil`.

- [ ] **Step 1: Testes de unidade que falham**

Adicionar em `server/domain/servicos.test.js` (ajustar o import para incluir `errosDoServico`):

```js
describe('errosDoServico', () => {
  const base = { etapa: undefined, ficticio: 0, tiposLinhas: null, criando: true };

  it('site aceita qualquer etapa e só linhas sistemas/saas', () => {
    expect(errosDoServico({ ...base, servico: 'site_sistema', etapa: 'proposta', tiposLinhas: ['sistemas', 'saas'] })).toEqual([]);
    expect(errosDoServico({ ...base, servico: 'site_sistema', tiposLinhas: ['placas_nfc'] }))
      .toEqual([{ campo: 'servicos', mensagem: 'Sites e sistemas só aceitam Sistemas e SaaS' }]);
  });

  it('GMN nasce em andamento, pode ir para entregue e não tem linhas nem fictício', () => {
    expect(errosDoServico({ ...base, servico: 'google_meu_negocio', etapa: 'entregue' }))
      .toEqual([{ campo: 'etapa', mensagem: 'Etapa inválida para este serviço' }]);
    expect(errosDoServico({ ...base, servico: 'google_meu_negocio', etapa: 'entregue', criando: false })).toEqual([]);
    expect(errosDoServico({ ...base, servico: 'google_meu_negocio', etapa: 'proposta', criando: false }))
      .toEqual([{ campo: 'etapa', mensagem: 'Etapa inválida para este serviço' }]);
    expect(errosDoServico({ ...base, servico: 'google_meu_negocio', ficticio: 1 }))
      .toEqual([{ campo: 'ficticio', mensagem: 'Só sites e sistemas podem ser fictícios' }]);
    expect(errosDoServico({ ...base, servico: 'google_meu_negocio', tiposLinhas: ['saas'] }))
      .toEqual([{ campo: 'servicos', mensagem: 'Google Meu Negócio não tem linhas de serviço' }]);
  });

  it('placas exige exatamente uma linha placas_nfc na criação', () => {
    const erro = [{ campo: 'servicos', mensagem: 'Venda de placas precisa de exatamente uma linha de placas' }];
    expect(errosDoServico({ ...base, servico: 'placas_nfc' })).toEqual(erro);
    expect(errosDoServico({ ...base, servico: 'placas_nfc', tiposLinhas: ['placas_nfc', 'saas'] })).toEqual(erro);
    expect(errosDoServico({ ...base, servico: 'placas_nfc', tiposLinhas: ['placas_nfc'] })).toEqual([]);
    expect(errosDoServico({ ...base, servico: 'placas_nfc', criando: false })).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run server/domain/servicos.test.js`
Expected: FAIL (`errosDoServico is not a function`).

- [ ] **Step 3: Implementar `errosDoServico`**

Em `server/domain/servicos.js`:

```js
const ETAPAS_SERVICO_SIMPLES = ['andamento', 'entregue'];

export function errosDoServico({ servico, etapa, ficticio, tiposLinhas, criando }) {
  const erros = [];
  if (servico !== 'site_sistema') {
    const permitidas = criando ? ['andamento'] : ETAPAS_SERVICO_SIMPLES;
    if (etapa !== undefined && !permitidas.includes(etapa)) erros.push({ campo: 'etapa', mensagem: 'Etapa inválida para este serviço' });
    if (ficticio) erros.push({ campo: 'ficticio', mensagem: 'Só sites e sistemas podem ser fictícios' });
  }
  const linhasObrigatorias = criando && servico === 'placas_nfc';
  if (tiposLinhas || linhasObrigatorias) {
    const tipos = tiposLinhas ?? [];
    if (servico === 'site_sistema' && tipos.some((t) => !LINHAS_SITE.includes(t))) {
      erros.push({ campo: 'servicos', mensagem: 'Sites e sistemas só aceitam Sistemas e SaaS' });
    }
    if (servico === 'google_meu_negocio' && tipos.length) {
      erros.push({ campo: 'servicos', mensagem: 'Google Meu Negócio não tem linhas de serviço' });
    }
    if (servico === 'placas_nfc' && !(tipos.length === 1 && tipos[0] === 'placas_nfc')) {
      erros.push({ campo: 'servicos', mensagem: 'Venda de placas precisa de exatamente uma linha de placas' });
    }
  }
  return erros;
}
```

Run: `npx vitest run server/domain/servicos.test.js` → PASS.

- [ ] **Step 4: Testes de rota que falham**

Dentro do `describe('/api/projetos — tipo de serviço')` da Task 1, acrescentar:

```js
  it('GMN nasce em andamento; etapa diferente na criação dá 400', async () => {
    const res = await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'GMN', servico: 'google_meu_negocio', link_perfil: 'https://g.page/ana' }).expect(201);
    expect(res.body).toMatchObject({ servico: 'google_meu_negocio', etapa: 'andamento', link_perfil: 'https://g.page/ana' });
    const erro = await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'GMN', servico: 'google_meu_negocio', etapa: 'proposta' }).expect(400);
    expect(erro.body.erros).toEqual([{ campo: 'etapa', mensagem: 'Etapa inválida para este serviço' }]);
  });

  it('GMN vai para entregue mas não para proposta', async () => {
    const gmn = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'GMN', servico: 'google_meu_negocio' })).body;
    await ctx.http.put(`/api/projetos/${gmn.id}`).send({ etapa: 'proposta' }).expect(400);
    const res = await ctx.http.put(`/api/projetos/${gmn.id}`).send({ etapa: 'entregue' }).expect(200);
    expect(res.body).toMatchObject({ etapa: 'entregue', data_entrega: '2026-09-23' });
  });

  it('servico não muda depois de criado', async () => {
    const site = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Site' })).body;
    const res = await ctx.http.put(`/api/projetos/${site.id}`).send({ servico: 'google_meu_negocio' }).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'servico', mensagem: 'Não é possível mudar o tipo de serviço' }]);
    await ctx.http.put(`/api/projetos/${site.id}`).send({ servico: 'site_sistema', titulo: 'Site 2' }).expect(200);
  });

  it('GMN não pode ser fictício', async () => {
    const res = await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'GMN', servico: 'google_meu_negocio', ficticio: true }).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'ficticio', mensagem: 'Só sites e sistemas podem ser fictícios' }]);
  });

  it('site não aceita linha de placas e placas exige a linha', async () => {
    const modelo = (await ctx.http.post('/api/placas/modelos').send({ nome: 'Placa', preco_venda_centavos: 8000 })).body;
    const site = await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'Site', servicos: [{ tipo: 'placas_nfc', modelo_id: modelo.id, quantidade: 1 }],
    }).expect(400);
    expect(site.body.erros).toEqual([{ campo: 'servicos', mensagem: 'Sites e sistemas só aceitam Sistemas e SaaS' }]);
    const placas = await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Placas', servico: 'placas_nfc' }).expect(400);
    expect(placas.body.erros).toEqual([{ campo: 'servicos', mensagem: 'Venda de placas precisa de exatamente uma linha de placas' }]);
  });
```

- [ ] **Step 5: Ajustar os testes existentes de `describe('/api/projetos com serviços')`**

As regras novas mudam testes antigos. Em `server/routes/projetos.test.js`:
- Em **todo** `POST /api/projetos` cujo `servicos` contém `tipo: 'placas_nfc'`, acrescentar `servico: 'placas_nfc',` no corpo (testes: "cria com 1 serviço de placas…", "mudar etapa para entregue com serviço de placas…", "mudar etapa para entregue de novo…", "modelo sem receita…", "placas sem valor informado usam o preço de pack…", "…preço de recompra…", "cliente novo (novo_cliente) usa o preço de pack", "valor_total_centavos explícito é respeitado", "valor_total_centavos inválido responde 400", "reenviar a linha com valor_total_centavos…", "entregar 3 placas por R$ 200…").
- "cria com 2 serviços (placas + saas)…": trocar o título do teste para `'cria com 2 serviços (sistemas + saas) somando os dois, com valor customizado por linha'`, remover a criação do modelo e usar `servicos: [{ tipo: 'sistemas', valor_unitario_centavos: 8000 }, { tipo: 'saas', valor_unitario_centavos: 15000 }]`; esperar `valor_total_centavos` 23000 e tipos `['saas', 'sistemas']`.
- "funciona também no fluxo de criar com novo_cliente": trocar a linha por `{ tipo: 'saas', valor_unitario_centavos: 20000 }`.
- "atualizar trocando os serviços recalcula o total": trocar `google_meu_negocio` por `sistemas` (no envio e no `expect.objectContaining`).
- "mudar etapa para entregue de novo não duplica a venda": trocar o `PUT {etapa: 'proposta'}` por `PUT {etapa: 'andamento'}`.
- "modelo sem receita bloqueia…": a última linha passa a esperar `.toBe('andamento')`.
- **Apagar** o teste "atualizar preserva linha de placas_nfc já vendida (com venda_id) ao trocar os serviços" (a Task 5 substitui pela trava de venda entregue).

- [ ] **Step 6: Implementar na rota**

Em `server/routes/projetos.js`:
- importar `errosDoServico` de `../domain/servicos.js`;
- em `REGRAS_PROJETO`, acrescentar:

```js
  servico: { tipo: 'enum', valores: SERVICOS },
  link_perfil: { tipo: 'texto' },
```

- dentro de `rotasProjetos`, logo após `exigirCliente`:

```js
  function exigirRegrasDoServico(contexto) {
    const erros = errosDoServico(contexto);
    if (erros.length) throw new ErroValidacao(erros);
  }
```

- substituir o `r.post('/', …)` inteiro por:

```js
  r.post('/', (req, res) => {
    const corpo = req.body ?? {};
    const temServicos = corpo.servicos !== undefined;
    const clienteDaOportunidade = corpo.novo_cliente ? null : (Number(corpo.cliente_id) || null);
    const servicosValidados = temServicos
      ? validarServicos(corpo.servicos, { modelosRepo: modelos, db, clienteId: clienteDaOportunidade })
      : null;

    function prepararDados(dadosValidados) {
      const servico = dadosValidados.servico ?? 'site_sistema';
      exigirRegrasDoServico({
        servico, etapa: dadosValidados.etapa, ficticio: dadosValidados.ficticio,
        tiposLinhas: servicosValidados?.map((s) => s.tipo) ?? null, criando: true,
      });
      let dados = { ...dadosValidados, servico };
      if (servico !== 'site_sistema') dados.etapa = 'andamento';
      if (temServicos) {
        const descontoCentavos = dados.desconto_centavos ?? 0;
        dados = { ...dados, desconto_centavos: descontoCentavos, valor_total_centavos: calcularValorTotal(servicosValidados, descontoCentavos) };
      }
      exigirDadosMensalidade(null, dados);
      return dados;
    }

    function criarProjetoCompleto(dados) {
      const projeto = projetos.criar(dados);
      if (temServicos) criarServicosDoProjeto(projeto.id, servicosValidados);
      return projeto;
    }

    if (corpo.novo_cliente) {
      let dadosCliente;
      try {
        dadosCliente = validar(corpo.novo_cliente, REGRAS_CLIENTE);
      } catch (erro) {
        if (!(erro instanceof ErroValidacao)) throw erro;
        throw new ErroValidacao(erro.erros.map((e) => ({ ...e, campo: `novo_cliente.${e.campo}` })));
      }
      const { cliente_id: _ignorado, ...regrasSemCliente } = REGRAS_PROJETO;
      const dados = prepararDados(aplicarRegrasProjeto(null, validar(corpo, regrasSemCliente), hoje()));
      const criado = emTransacao(db, () => {
        const cliente = clientes.criar(dadosCliente);
        return criarProjetoCompleto({ ...dados, cliente_id: cliente.id });
      });
      return res.status(201).json(comServicos(projetos.obterComCliente(criado.id)));
    }
    const dados = prepararDados(aplicarRegrasProjeto(null, validar(corpo, REGRAS_PROJETO), hoje()));
    exigirCliente(dados.cliente_id);
    const criado = emTransacao(db, () => criarProjetoCompleto(dados));
    res.status(201).json(comServicos(projetos.obterComCliente(criado.id)));
  });
```

- no `r.put('/:id', …)`, logo depois da linha `const dadosBase = aplicarRegrasProjeto(…)`, inserir:

```js
    if (dadosBase.servico !== undefined && dadosBase.servico !== atual.servico) {
      throw new ErroValidacao([{ campo: 'servico', mensagem: 'Não é possível mudar o tipo de serviço' }]);
    }
    exigirRegrasDoServico({
      servico: atual.servico, etapa: dadosBase.etapa, ficticio: dadosBase.ficticio,
      tiposLinhas: servicosValidados?.map((s) => s.tipo) ?? null, criando: false,
    });
```

- [ ] **Step 7: Rodar e ver passar**

Run: `npx vitest run --project server`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add server/domain/servicos.js server/domain/servicos.test.js server/routes/projetos.js server/routes/projetos.test.js
git commit -m "feat: regras de etapa, linhas e ficticio por tipo de servico"
```

---

### Task 3: QR codes ligados a vendas de placas

**Files:**
- Create: `server/repos/projetosQrcodes.js`
- Modify: `server/routes/projetos.js`
- Test: `server/routes/projetos.test.js`

**Interfaces:**
- Consumes: tabela `projetos_qrcodes` (Task 1); `prepararDados`/PUT da Task 2.
- Produces: `repoProjetosQrcodes(db)` com `listar(projetoId) → [{id, nome}]` e `substituir(projetoId, ids)`. Toda resposta de projeto (`comServicos`) inclui `qrcodes: [{id, nome}]`. `POST`/`PUT` aceitam `qrcodes: number[]`.

- [ ] **Step 1: Testes que falham**

Novo bloco em `server/routes/projetos.test.js`:

```js
describe('/api/projetos — QR codes da venda de placas', () => {
  let modelo;
  const criarQr = async (clienteId, nome) => (await ctx.http.post('/api/qrcodes').send({ cliente_id: clienteId, nome, categoria: 'cardapio' }).expect(201)).body;
  const venda = (extra = {}) => ({
    cliente_id: cliente.id, titulo: 'Placas NFC', servico: 'placas_nfc',
    servicos: [{ tipo: 'placas_nfc', modelo_id: modelo.id, quantidade: 1, valor_total_centavos: 8000 }], ...extra,
  });

  beforeEach(async () => {
    modelo = (await ctx.http.post('/api/placas/modelos').send({ nome: 'Placa', preco_venda_centavos: 8000 })).body;
  });

  it('liga QRs do cliente e devolve {id, nome}', async () => {
    const qr1 = await criarQr(cliente.id, 'Balcão');
    const qr2 = await criarQr(cliente.id, 'Mesa');
    const res = await ctx.http.post('/api/projetos').send(venda({ qrcodes: [qr2.id, qr1.id] })).expect(201);
    expect(res.body.qrcodes).toEqual([{ id: qr1.id, nome: 'Balcão' }, { id: qr2.id, nome: 'Mesa' }]);
  });

  it('rejeita QR de outro cliente', async () => {
    const outro = (await ctx.http.post('/api/clientes').send({ nome: 'Bia' })).body;
    const qr = await criarQr(outro.id, 'Dela');
    const res = await ctx.http.post('/api/projetos').send(venda({ qrcodes: [qr.id] })).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'qrcodes', mensagem: 'QR não pertence a este cliente' }]);
  });

  it('só placas aceitam qrcodes', async () => {
    const qr = await criarQr(cliente.id, 'Balcão');
    const res = await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'GMN', servico: 'google_meu_negocio', qrcodes: [qr.id] }).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'qrcodes', mensagem: 'Só vendas de placas têm QR codes' }]);
  });

  it('PUT substitui as ligações; excluir o QR remove a ligação', async () => {
    const qr1 = await criarQr(cliente.id, 'Balcão');
    const qr2 = await criarQr(cliente.id, 'Mesa');
    const criado = (await ctx.http.post('/api/projetos').send(venda({ qrcodes: [qr1.id] }))).body;
    const res = await ctx.http.put(`/api/projetos/${criado.id}`).send({ qrcodes: [qr2.id] }).expect(200);
    expect(res.body.qrcodes).toEqual([{ id: qr2.id, nome: 'Mesa' }]);
    await ctx.http.delete(`/api/qrcodes/${qr2.id}`).expect(204);
    expect((await ctx.http.get(`/api/projetos/${criado.id}`)).body.qrcodes).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run server/routes/projetos.test.js -t "QR codes da venda"`
Expected: FAIL (`qrcodes` indefinido).

- [ ] **Step 3: Implementar**

`server/repos/projetosQrcodes.js`:

```js
import { linha } from './crud.js';

export function repoProjetosQrcodes(db) {
  return {
    listar(projetoId) {
      return db
        .prepare(`SELECT q.id, q.nome FROM projetos_qrcodes pq JOIN qrcodes q ON q.id = pq.qrcode_id
          WHERE pq.projeto_id = ? ORDER BY q.id`)
        .all(projetoId)
        .map(linha);
    },
    substituir(projetoId, qrcodeIds) {
      db.prepare('DELETE FROM projetos_qrcodes WHERE projeto_id = ?').run(projetoId);
      const inserir = db.prepare('INSERT INTO projetos_qrcodes (projeto_id, qrcode_id) VALUES (?, ?)');
      for (const qrcodeId of qrcodeIds) inserir.run(projetoId, qrcodeId);
    },
  };
}
```

Em `server/routes/projetos.js`:
- imports: `import { repoProjetosQrcodes } from '../repos/projetosQrcodes.js';` e `import { repoQrcodes } from '../repos/qrcodes.js';`
- em `rotasProjetos`, junto dos outros repos: `const projetosQrcodes = repoProjetosQrcodes(db);` e `const qrcodes = repoQrcodes(db);`
- em `comServicos`, acrescentar ao objeto retornado: `qrcodes: projetosQrcodes.listar(projeto.id),`
- nova função dentro de `rotasProjetos`:

```js
  function validarQrcodes(qrcodesBrutos, { servico, clienteId }) {
    if (qrcodesBrutos === undefined) return null;
    if (servico !== 'placas_nfc') throw new ErroValidacao([{ campo: 'qrcodes', mensagem: 'Só vendas de placas têm QR codes' }]);
    if (!Array.isArray(qrcodesBrutos) || !qrcodesBrutos.every((qrId) => Number.isInteger(qrId) && qrId > 0)) {
      throw new ErroValidacao([{ campo: 'qrcodes', mensagem: 'Deve ser uma lista de QR codes' }]);
    }
    const ids = [...new Set(qrcodesBrutos)];
    for (const qrId of ids) {
      if (qrcodes.obter(qrId)?.cliente_id !== clienteId) {
        throw new ErroValidacao([{ campo: 'qrcodes', mensagem: 'QR não pertence a este cliente' }]);
      }
    }
    return ids;
  }
```

- no POST: dentro de `criarProjetoCompleto(dados)`, antes do `return projeto;`, acrescentar
  `if (qrcodesValidados) projetosQrcodes.substituir(projeto.id, qrcodesValidados);`
  e declarar `let qrcodesValidados = null;` logo após `servicosValidados`. Em `prepararDados`, antes do `return dados;`, acrescentar
  `qrcodesValidados = validarQrcodes(corpo.qrcodes, { servico, clienteId: dados.cliente_id ?? null });`
  (no fluxo `novo_cliente`, `dados.cliente_id` não existe → `null`, então qualquer QR é rejeitado, como deve ser).
- no PUT: depois de `exigirRegrasDoServico(...)`, acrescentar
  `const qrcodesValidados = validarQrcodes(corpo.qrcodes, { servico: atual.servico, clienteId: dadosBase.cliente_id ?? atual.cliente_id });`
  e, dentro do `emTransacao`, depois de `projetos.atualizar(id, dados);`:
  `if (qrcodesValidados) projetosQrcodes.substituir(id, qrcodesValidados);`

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run --project server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/repos/projetosQrcodes.js server/routes/projetos.js server/routes/projetos.test.js
git commit -m "feat: liga QR codes do cliente a venda de placas"
```

---

### Task 4: Cobrança única de GMN e placas

**Files:**
- Create: `server/domain/cobranca.js`
- Test: `server/domain/cobranca.test.js`
- Create: `server/repos/parcelas.js`
- Modify: `server/routes/parcelas.js` (passa a usar o repo)
- Modify: `server/routes/projetos.js`
- Test: `server/routes/projetos.test.js`

**Interfaces:**
- Produces: `planejarCobrancaUnica(avulsas, { valorCentavos, vencimento }) → {acao: 'nada'} | {acao: 'criar', valor_centavos, vencimento} | {acao: 'atualizar', id, valor_centavos, vencimento} | {acao: 'remover', id}`; `repoParcelas(db)` (CRUD de `parcelas` + `listarAvulsas(projetoId)`); `CAMPOS_PARCELA`. `POST/PUT /projetos` aceitam `vencimento` (AAAA-MM-DD) para GMN/placas.

- [ ] **Step 1: Testes de unidade que falham**

`server/domain/cobranca.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { planejarCobrancaUnica } from './cobranca.js';

const aberta = { id: 7, valor_centavos: 5000, vencimento: '2026-10-10', pago_em: null };
const paga = { ...aberta, pago_em: '2026-10-01' };

describe('planejarCobrancaUnica', () => {
  it('cria quando não há parcela, há valor e vencimento', () => {
    expect(planejarCobrancaUnica([], { valorCentavos: 5000, vencimento: '2026-10-10' }))
      .toEqual({ acao: 'criar', valor_centavos: 5000, vencimento: '2026-10-10' });
  });

  it('sem vencimento ou sem valor não cria', () => {
    expect(planejarCobrancaUnica([], { valorCentavos: 5000, vencimento: undefined })).toEqual({ acao: 'nada' });
    expect(planejarCobrancaUnica([], { valorCentavos: 0, vencimento: '2026-10-10' })).toEqual({ acao: 'nada' });
  });

  it('atualiza a parcela aberta, mantendo o vencimento se não vier outro', () => {
    expect(planejarCobrancaUnica([aberta], { valorCentavos: 6000, vencimento: undefined }))
      .toEqual({ acao: 'atualizar', id: 7, valor_centavos: 6000, vencimento: '2026-10-10' });
  });

  it('valor 0 remove a parcela aberta', () => {
    expect(planejarCobrancaUnica([aberta], { valorCentavos: 0, vencimento: undefined })).toEqual({ acao: 'remover', id: 7 });
  });

  it('parcela paga ou várias parcelas avulsas: não mexe', () => {
    expect(planejarCobrancaUnica([paga], { valorCentavos: 9999, vencimento: '2026-12-01' })).toEqual({ acao: 'nada' });
    expect(planejarCobrancaUnica([aberta, { ...aberta, id: 8 }], { valorCentavos: 1, vencimento: '2026-12-01' })).toEqual({ acao: 'nada' });
  });
});
```

Run: `npx vitest run server/domain/cobranca.test.js` → FAIL (módulo não existe).

- [ ] **Step 2: Implementar `planejarCobrancaUnica`**

`server/domain/cobranca.js`:

```js
// Decide o que fazer com a parcela "Pagamento" de um GMN ou venda de placas.
// `avulsas` são as parcelas do projeto que não são mensalidade.
export function planejarCobrancaUnica(avulsas, { valorCentavos, vencimento }) {
  if (avulsas.length > 1) return { acao: 'nada' };
  const [parcela] = avulsas;
  if (!parcela) {
    return valorCentavos > 0 && vencimento
      ? { acao: 'criar', valor_centavos: valorCentavos, vencimento }
      : { acao: 'nada' };
  }
  if (parcela.pago_em) return { acao: 'nada' };
  if (valorCentavos <= 0) return { acao: 'remover', id: parcela.id };
  return { acao: 'atualizar', id: parcela.id, valor_centavos: valorCentavos, vencimento: vencimento ?? parcela.vencimento };
}
```

Run: `npx vitest run server/domain/cobranca.test.js` → PASS.

- [ ] **Step 3: Extrair o repo de parcelas**

`server/repos/parcelas.js`:

```js
import { criarRepo } from './crud.js';

export const CAMPOS_PARCELA = ['projeto_id', 'descricao', 'valor_centavos', 'vencimento', 'pago_em', 'mensalidade'];

export function repoParcelas(db) {
  const base = criarRepo(db, 'parcelas', CAMPOS_PARCELA);
  return {
    ...base,
    listarAvulsas(projetoId) {
      return base.listar({ projeto_id: projetoId, mensalidade: 0 }, 'vencimento, id');
    },
  };
}
```

Em `server/routes/parcelas.js`: trocar `import { criarRepo, linha, emTransacao } from '../repos/crud.js';` por `import { linha, emTransacao } from '../repos/crud.js';` + `import { repoParcelas } from '../repos/parcelas.js';`, e a linha `const parcelas = criarRepo(db, 'parcelas', [...]);` por `const parcelas = repoParcelas(db);`.

Run: `npx vitest run server/routes/parcelas.test.js` → PASS (refatoração sem mudança de comportamento).

- [ ] **Step 4: Testes de rota que falham**

Novo bloco em `server/routes/projetos.test.js`:

```js
describe('/api/projetos — cobrança de GMN e placas', () => {
  const parcelasDe = async (id) => (await ctx.http.get(`/api/projetos/${id}/parcelas`)).body.parcelas;
  const gmn = (extra = {}) => ({ cliente_id: cliente.id, titulo: 'Google Meu Negócio', servico: 'google_meu_negocio', ...extra });

  it('cobrança única cria a parcela "Pagamento"', async () => {
    const criado = (await ctx.http.post('/api/projetos').send(gmn({ valor_total_centavos: 20000, vencimento: '2026-10-05' })).expect(201)).body;
    expect(await parcelasDe(criado.id)).toEqual([
      expect.objectContaining({ descricao: 'Pagamento', valor_centavos: 20000, vencimento: '2026-10-05', pago_em: null, mensalidade: 0 }),
    ]);
  });

  it('cobrança única com valor exige vencimento', async () => {
    const res = await ctx.http.post('/api/projetos').send(gmn({ valor_total_centavos: 20000 })).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'vencimento', mensagem: 'Obrigatório para cobrança única' }]);
  });

  it('editar o valor atualiza a parcela aberta; parcela paga não muda', async () => {
    const criado = (await ctx.http.post('/api/projetos').send(gmn({ valor_total_centavos: 20000, vencimento: '2026-10-05' }))).body;
    await ctx.http.put(`/api/projetos/${criado.id}`).send({ valor_total_centavos: 25000, vencimento: '2026-10-20' }).expect(200);
    const [parcela] = await parcelasDe(criado.id);
    expect(parcela).toMatchObject({ valor_centavos: 25000, vencimento: '2026-10-20' });
    await ctx.http.put(`/api/parcelas/${parcela.id}`).send({ pago_em: '2026-10-01' }).expect(200);
    await ctx.http.put(`/api/projetos/${criado.id}`).send({ valor_total_centavos: 1 }).expect(200);
    expect((await parcelasDe(criado.id))[0]).toMatchObject({ valor_centavos: 25000, pago_em: '2026-10-01' });
  });

  it('passar para mensalidade remove a parcela única ainda não paga', async () => {
    const criado = (await ctx.http.post('/api/projetos').send(gmn({ valor_total_centavos: 20000, vencimento: '2026-10-05' }))).body;
    await ctx.http.put(`/api/projetos/${criado.id}`).send({
      valor_total_centavos: 0, mensalidade_ativa: true, mensalidade_valor_centavos: 5000, mensalidade_dia_vencimento: 10,
    }).expect(200);
    const parcelas = await parcelasDe(criado.id);
    expect(parcelas).toEqual([expect.objectContaining({ descricao: 'Mensalidade', valor_centavos: 5000, mensalidade: 1 })]);
  });

  it('marcar configurado sem vencimento, depois de apagar a parcela no Financeiro, não dá erro nem recria', async () => {
    const criado = (await ctx.http.post('/api/projetos').send(gmn({ valor_total_centavos: 20000, vencimento: '2026-10-05' }))).body;
    const [parcela] = await parcelasDe(criado.id);
    await ctx.http.delete(`/api/parcelas/${parcela.id}`).expect(204);
    await ctx.http.put(`/api/projetos/${criado.id}`).send({ etapa: 'entregue' }).expect(200);
    expect(await parcelasDe(criado.id)).toEqual([]);
  });

  it('com parcelas feitas à mão no Financeiro, a sincronização não mexe', async () => {
    const criado = (await ctx.http.post('/api/projetos').send(gmn({ valor_total_centavos: 20000, vencimento: '2026-10-05' }))).body;
    await ctx.http.post(`/api/projetos/${criado.id}/parcelas`).send({ valor_centavos: 100, vencimento: '2026-11-05' }).expect(201);
    await ctx.http.put(`/api/projetos/${criado.id}`).send({ valor_total_centavos: 30000 }).expect(200);
    expect((await parcelasDe(criado.id)).map((p) => p.valor_centavos)).toEqual([20000, 100]);
  });

  it('venda de placas cobra o valor total da linha', async () => {
    const modelo = (await ctx.http.post('/api/placas/modelos').send({ nome: 'Placa', preco_venda_centavos: 8000 })).body;
    const criado = (await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'Placas NFC', servico: 'placas_nfc', vencimento: '2026-10-05',
      servicos: [{ tipo: 'placas_nfc', modelo_id: modelo.id, quantidade: 2, valor_total_centavos: 15000 }],
    }).expect(201)).body;
    expect(await parcelasDe(criado.id)).toEqual([expect.objectContaining({ descricao: 'Pagamento', valor_centavos: 15000 })]);
  });

  it('site não ganha parcela automática', async () => {
    const criado = (await ctx.http.post('/api/projetos').send({ cliente_id: cliente.id, titulo: 'Site', valor_total_centavos: 50000, vencimento: '2026-10-05' }).expect(201)).body;
    expect(await parcelasDe(criado.id)).toEqual([]);
  });
});
```

Run: `npx vitest run server/routes/projetos.test.js -t "cobrança de GMN"` → FAIL.

- [ ] **Step 5: Implementar na rota**

Em `server/routes/projetos.js`:
- imports: `import { repoParcelas } from '../repos/parcelas.js';` e `import { planejarCobrancaUnica } from '../domain/cobranca.js';`
- no topo do arquivo, após `REGRAS_PROJETO`:

```js
const REGRA_VENCIMENTO = { vencimento: { tipo: 'data' } };
```

- em `rotasProjetos`: `const parcelas = repoParcelas(db);` e a função:

```js
  function sincronizarCobrancaUnica(projetoId, vencimento) {
    const projeto = projetos.obter(projetoId);
    if (projeto.servico === 'site_sistema') return;
    const plano = planejarCobrancaUnica(parcelas.listarAvulsas(projetoId), { valorCentavos: projeto.valor_total_centavos, vencimento });
    if (plano.acao === 'criar') {
      parcelas.criar({ projeto_id: projetoId, descricao: 'Pagamento', valor_centavos: plano.valor_centavos, vencimento: plano.vencimento });
    } else if (plano.acao === 'atualizar') {
      parcelas.atualizar(plano.id, { valor_centavos: plano.valor_centavos, vencimento: plano.vencimento });
    } else if (plano.acao === 'remover') {
      parcelas.remover(plano.id);
    }
  }
```

- no POST: logo após declarar `servicosValidados`, `const { vencimento } = validar(corpo, REGRA_VENCIMENTO, { parcial: true });`. Em `prepararDados`, antes do `return dados;`:

```js
      if (servico !== 'site_sistema' && !dados.mensalidade_ativa && dados.valor_total_centavos > 0 && !vencimento) {
        throw new ErroValidacao([{ campo: 'vencimento', mensagem: 'Obrigatório para cobrança única' }]);
      }
```

  e em `criarProjetoCompleto`, antes do `return projeto;`: `sincronizarCobrancaUnica(projeto.id, vencimento);`
- no PUT: depois de `const dadosBase = …`, `const { vencimento } = validar(corpo, REGRA_VENCIMENTO, { parcial: true });`; dentro do `emTransacao`, logo depois de `projetos.atualizar(id, dados);`: `sincronizarCobrancaUnica(id, vencimento);`

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run --project server`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/domain/cobranca.js server/domain/cobranca.test.js server/repos/parcelas.js server/routes/parcelas.js server/routes/projetos.js server/routes/projetos.test.js
git commit -m "feat: cobranca unica de GMN e placas vira parcela Pagamento"
```

---

### Task 5: Trava da venda entregue e exclusão de venda ligada

**Files:**
- Modify: `server/repos/servicos.js`
- Modify: `server/routes/projetos.js` (PUT)
- Modify: `server/routes/placas.js` (`DELETE /placas/vendas/:id`)
- Test: `server/routes/projetos.test.js`, `server/routes/placas.test.js`

**Interfaces:**
- Consumes: `valorLinhaServico` (`server/domain/servicos.js`), PUT da Task 4.
- Produces: `repoProjetosServicos(db).projetoDaVenda(vendaId) → number | null`.

- [ ] **Step 1: Testes que falham**

Em `server/routes/projetos.test.js`, dentro de `describe('/api/projetos com serviços')` (usa `prepararReceita` e `criarModeloDePlaca` já definidos ali):

```js
  it('venda de placas entregue não aceita troca de modelo, quantidade ou valor', async () => {
    const modelo = await criarModeloDePlaca(8000);
    await prepararReceita(modelo.id);
    const criado = (await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'P', servico: 'placas_nfc', servicos: [{ tipo: 'placas_nfc', modelo_id: modelo.id, quantidade: 1 }],
    })).body;
    await ctx.http.put(`/api/projetos/${criado.id}`).send({ etapa: 'entregue' }).expect(200);
    const res = await ctx.http.put(`/api/projetos/${criado.id}`).send({
      servicos: [{ tipo: 'placas_nfc', modelo_id: modelo.id, quantidade: 2, valor_total_centavos: 16000 }],
    }).expect(400);
    expect(res.body.erros).toEqual([{ campo: 'servicos', mensagem: 'Venda já entregue: modelo, quantidade e valor não podem mudar' }]);
    await ctx.http.put(`/api/projetos/${criado.id}`).send({ notas: 'Instalada no balcão' }).expect(200);
  });

  it('reenviar a mesma linha depois de entregue não duplica nem gera nova venda', async () => {
    const modelo = await criarModeloDePlaca(8000);
    await prepararReceita(modelo.id);
    const criado = (await ctx.http.post('/api/projetos').send({
      cliente_id: cliente.id, titulo: 'P', servico: 'placas_nfc', servicos: [{ tipo: 'placas_nfc', modelo_id: modelo.id, quantidade: 1, valor_total_centavos: 8000 }],
    })).body;
    await ctx.http.put(`/api/projetos/${criado.id}`).send({ etapa: 'entregue' }).expect(200);
    const res = await ctx.http.put(`/api/projetos/${criado.id}`).send({
      servicos: [{ tipo: 'placas_nfc', modelo_id: modelo.id, quantidade: 1, valor_total_centavos: 8000 }],
    }).expect(200);
    expect(res.body.servicos).toHaveLength(1);
    await ctx.http.put(`/api/projetos/${criado.id}`).send({ etapa: 'andamento' }).expect(200);
    await ctx.http.put(`/api/projetos/${criado.id}`).send({ etapa: 'entregue' }).expect(200);
    expect((await ctx.http.get('/api/placas/vendas')).body).toHaveLength(1);
  });
```

Em `server/routes/placas.test.js`, no fim do `describe('/api/placas/vendas')`, um teste que monta uma venda ligada (o arquivo já tem `criarContexto`; seguir o estilo do teste na linha ~533, que insere em `projetos_servicos` direto):

```js
  it('não exclui venda ligada a um serviço do perfil do cliente', async () => {
    const cliente = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
    const modelo = (await ctx.http.post('/api/placas/modelos').send({ nome: 'Placa', preco_venda_centavos: 8000 })).body;
    const t = 'x';
    const { lastInsertRowid: vendaId } = ctx.db.prepare(`INSERT INTO placas_vendas (modelo_id, quantidade, preco_vendido_centavos, custo_unitario_centavos, cliente_id, data_venda, criado_em, atualizado_em)
      VALUES (?, 1, 8000, 100, ?, '2026-09-01', ?, ?)`).run(modelo.id, cliente.id, t, t);
    const { lastInsertRowid: projetoId } = ctx.db.prepare(`INSERT INTO projetos (cliente_id, titulo, etapa, servico, criado_em, atualizado_em)
      VALUES (?, 'Placas NFC', 'entregue', 'placas_nfc', ?, ?)`).run(cliente.id, t, t);
    ctx.db.prepare(`INSERT INTO projetos_servicos (projeto_id, tipo, modelo_id, quantidade, valor_unitario_centavos, valor_total_centavos, venda_id, criado_em, atualizado_em)
      VALUES (?, 'placas_nfc', ?, 1, 8000, 8000, ?, ?, ?)`).run(projetoId, modelo.id, vendaId, t, t);

    const res = await ctx.http.delete(`/api/placas/vendas/${vendaId}`).expect(409);
    expect(res.body.erro).toBe('Esta venda está ligada a um serviço no perfil do cliente. Exclua o serviço por lá antes.');
    await ctx.http.delete(`/api/projetos/${projetoId}`).expect(204);
    await ctx.http.delete(`/api/placas/vendas/${vendaId}`).expect(204);
  });
```

(Se o `describe` de vendas usar outro nome para o contexto que não `ctx`, ajustar para o nome local.)

Run: `npx vitest run server/routes/projetos.test.js server/routes/placas.test.js` → FAIL (o primeiro passa com 200; o segundo duplica a linha; o DELETE dá 500).

- [ ] **Step 2: Implementar**

`server/repos/servicos.js` — acrescentar no objeto retornado:

```js
    projetoDaVenda(vendaId) {
      return db.prepare('SELECT projeto_id FROM projetos_servicos WHERE venda_id = ?').get(vendaId)?.projeto_id ?? null;
    },
```

`server/routes/projetos.js`:
- função dentro de `rotasProjetos`:

```js
  // Venda de placas já entregue: só aceita reenviar a mesma linha (o formulário pode reenviar sem mudar nada).
  function linhasParaTrocar(projetoId, servicosValidados) {
    if (!servicosValidados) return null;
    const vendida = projetosServicos.listar(projetoId).find((l) => l.tipo === 'placas_nfc' && l.venda_id);
    if (!vendida) return servicosValidados;
    const [nova] = servicosValidados;
    const igual = nova && nova.modelo_id === vendida.modelo_id && nova.quantidade === vendida.quantidade
      && valorLinhaServico(nova) === valorLinhaServico(vendida);
    if (!igual) {
      throw new ErroValidacao([{ campo: 'servicos', mensagem: 'Venda já entregue: modelo, quantidade e valor não podem mudar' }]);
    }
    return null;
  }
```

- no PUT, logo depois do `validarQrcodes(...)` da Task 3: `const linhasNovas = atual.servico === 'placas_nfc' ? linhasParaTrocar(id, servicosValidados) : servicosValidados;`
- dentro do `emTransacao`, trocar `if (temServicos) {` por `if (linhasNovas) {` e, no bloco, `criarServicosDoProjeto(id, servicosValidados);` por `criarServicosDoProjeto(id, linhasNovas);`.

`server/routes/placas.js`:
- import `import { repoProjetosServicos } from '../repos/servicos.js';` (se ainda não houver) e `ErroHttp` de `../http/erros.js`;
- `const projetosServicos = repoProjetosServicos(db);` junto dos outros repos;
- substituir a rota de exclusão:

```js
  r.delete('/placas/vendas/:id', (req, res) => {
    const id = lerId(req.params.id);
    if (projetosServicos.projetoDaVenda(id)) {
      throw new ErroHttp(409, 'Esta venda está ligada a um serviço no perfil do cliente. Exclua o serviço por lá antes.');
    }
    if (!vendas.remover(id)) throw naoEncontrado('Venda');
    res.status(204).end();
  });
```

- [ ] **Step 3: Rodar e ver passar**

Run: `npx vitest run --project server`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add server/repos/servicos.js server/routes/projetos.js server/routes/placas.js server/routes/projetos.test.js server/routes/placas.test.js
git commit -m "feat: trava venda de placas entregue e protege exclusao de venda ligada"
```

---

### Task 6: `GET /clientes/:id/placas`

**Files:**
- Modify: `server/repos/placas.js`
- Modify: `server/routes/clientes.js`
- Test: `server/routes/clientes.test.js`

**Interfaces:**
- Produces: `repoPlacasVendas(db).listarAvulsasDoCliente(clienteId) → [{...venda, modelo_nome}]`; `GET /api/clientes/:id/placas → { vendas_avulsas: [...], ja_comprou: number }`.

- [ ] **Step 1: Teste que falha**

Em `server/routes/clientes.test.js` (seguir o estilo de contexto do arquivo; se ele não tiver `ctx` em `beforeEach`, criar com `const ctx = criarContexto();` dentro do teste):

```js
describe('GET /api/clientes/:id/placas', () => {
  it('lista vendas avulsas do cliente e soma o que ele já comprou', async () => {
    const ctx = criarContexto();
    const ana = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
    const modelo = (await ctx.http.post('/api/placas/modelos').send({ nome: 'Placa 10x10', preco_venda_centavos: 8000 })).body;
    const inserirVenda = (quantidade, data) => Number(ctx.db.prepare(`INSERT INTO placas_vendas (modelo_id, quantidade, preco_vendido_centavos, custo_unitario_centavos, cliente_id, data_venda, criado_em, atualizado_em)
      VALUES (?, ?, 8000, 100, ?, ?, 'x', 'x')`).run(modelo.id, quantidade, ana.id, data).lastInsertRowid);
    inserirVenda(2, '2026-08-01');
    const vendaDoPerfil = inserirVenda(3, '2026-09-01');
    const { lastInsertRowid: projetoId } = ctx.db.prepare(`INSERT INTO projetos (cliente_id, titulo, etapa, servico, criado_em, atualizado_em)
      VALUES (?, 'Placas NFC', 'entregue', 'placas_nfc', 'x', 'x')`).run(ana.id);
    ctx.db.prepare(`INSERT INTO projetos_servicos (projeto_id, tipo, modelo_id, quantidade, valor_unitario_centavos, valor_total_centavos, venda_id, criado_em, atualizado_em)
      VALUES (?, 'placas_nfc', ?, 3, 8000, 24000, ?, 'x', 'x')`).run(projetoId, modelo.id, vendaDoPerfil);

    const res = await ctx.http.get(`/api/clientes/${ana.id}/placas`).expect(200);
    expect(res.body.ja_comprou).toBe(5);
    expect(res.body.vendas_avulsas).toEqual([
      expect.objectContaining({ quantidade: 2, data_venda: '2026-08-01', modelo_nome: 'Placa 10x10' }),
    ]);
    await ctx.http.get('/api/clientes/999/placas').expect(404);
  });
});
```

Garantir o import `import { criarContexto } from '../test/contexto.js';` no topo (o arquivo provavelmente já tem).

Run: `npx vitest run server/routes/clientes.test.js` → FAIL (404 de rota).

- [ ] **Step 2: Implementar**

`server/repos/placas.js`, dentro de `repoPlacasVendas`:

```js
    listarAvulsasDoCliente(clienteId) {
      return db.prepare(`
        SELECT v.*, m.nome AS modelo_nome FROM placas_vendas v JOIN placas_modelos m ON m.id = v.modelo_id
        WHERE v.cliente_id = ?
          AND v.id NOT IN (SELECT venda_id FROM projetos_servicos WHERE venda_id IS NOT NULL)
        ORDER BY v.data_venda DESC, v.id DESC
      `).all(clienteId).map(linha);
    },
```

(`linha` já é importado de `./crud.js` nesse arquivo; se não for, acrescentar ao import.)

`server/routes/clientes.js`: importar `repoPlacasVendas` de `../repos/placas.js`, criar `const vendasPlacas = repoPlacasVendas(db);` e adicionar antes de `r.put('/:id', …)`:

```js
  r.get('/:id/placas', (req, res) => {
    const cliente = clientes.obter(lerId(req.params.id));
    if (!cliente) throw naoEncontrado('Cliente');
    res.json({
      vendas_avulsas: vendasPlacas.listarAvulsasDoCliente(cliente.id),
      ja_comprou: vendasPlacas.quantidadeDoCliente(cliente.id),
    });
  });
```

- [ ] **Step 3: Rodar e ver passar**

Run: `npx vitest run --project server`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add server/repos/placas.js server/routes/clientes.js server/routes/clientes.test.js
git commit -m "feat: resumo de placas do cliente com vendas avulsas"
```

---

### Task 7: `/parcelas` com serviço

**Files:**
- Modify: `server/routes/parcelas.js`
- Test: `server/routes/parcelas.test.js`

**Interfaces:**
- Produces: cada item de `GET /api/parcelas` ganha `servico` e `cliente_id`; aceita `?servico=` (400 `'Serviço inválido'` se desconhecido).

- [ ] **Step 1: Teste que falha**

Em `server/routes/parcelas.test.js` (mesmo estilo de contexto do arquivo):

```js
describe('GET /api/parcelas por serviço', () => {
  it('inclui servico e cliente_id e filtra por ?servico=', async () => {
    const ctx = criarContexto({ hoje: '2026-09-23' });
    const ana = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
    const site = (await ctx.http.post('/api/projetos').send({ cliente_id: ana.id, titulo: 'Site' })).body;
    await ctx.http.post(`/api/projetos/${site.id}/parcelas`).send({ valor_centavos: 1000, vencimento: '2026-10-01' });
    await ctx.http.post('/api/projetos').send({
      cliente_id: ana.id, titulo: 'Google Meu Negócio', servico: 'google_meu_negocio', valor_total_centavos: 2000, vencimento: '2026-10-02',
    }).expect(201);

    const todas = (await ctx.http.get('/api/parcelas').expect(200)).body;
    expect(todas.map((p) => [p.servico, p.cliente_id])).toEqual([['site_sistema', ana.id], ['google_meu_negocio', ana.id]]);
    const gmn = (await ctx.http.get('/api/parcelas?servico=google_meu_negocio').expect(200)).body;
    expect(gmn.map((p) => p.valor_centavos)).toEqual([2000]);
    await ctx.http.get('/api/parcelas?servico=nada').expect(400);
  });
});
```

Run: `npx vitest run server/routes/parcelas.test.js` → FAIL.

- [ ] **Step 2: Implementar**

Em `server/routes/parcelas.js`: importar `SERVICOS` de `../domain/servicos.js` e trocar a rota `GET /parcelas` por:

```js
  r.get('/parcelas', (req, res) => {
    const { estado, mes, servico } = req.query;
    if (estado && !ESTADOS.includes(estado)) throw new ErroHttp(400, 'Estado inválido');
    if (mes && !/^\d{4}-\d{2}$/.test(mes)) throw new ErroHttp(400, 'Mês inválido (use AAAA-MM)');
    if (servico && !SERVICOS.includes(servico)) throw new ErroHttp(400, 'Serviço inválido');
    const lista = db
      .prepare(
        `SELECT pa.*, p.titulo AS projeto_titulo, p.servico, p.cliente_id, c.nome AS cliente_nome
         FROM parcelas pa JOIN projetos p ON p.id = pa.projeto_id JOIN clientes c ON c.id = p.cliente_id
         WHERE p.ficticio = 0
         ORDER BY pa.vencimento, pa.id`,
      )
      .all()
      .map((row) => comEstado(linha(row)))
      .filter((p) => (!estado || p.estado === estado) && (!mes || mesDe(p.vencimento) === mes) && (!servico || p.servico === servico));
    res.json(lista);
  });
```

- [ ] **Step 3: Rodar e ver passar**

Run: `npx vitest run --project server` → PASS.

- [ ] **Step 4: Commit**

```bash
git add server/routes/parcelas.js server/routes/parcelas.test.js
git commit -m "feat: parcelas mostram e filtram o tipo de servico"
```

---

### Task 8: Painel só com sites + "Para entregar"

**Files:**
- Modify: `server/routes/painel.js`
- Modify: `server/domain/painel.js`
- Test: `server/routes/painel.test.js`, `server/domain/painel.test.js`

**Interfaces:**
- Produces: `GET /api/painel` ganha `para_entregar: { gmn: number, placas: number, itens: [{ projeto_id, cliente_id, cliente_nome, servico }] }`; itens `tipo: 'parcela'` de `proximos` ganham `servico` e `cliente_id`.

- [ ] **Step 1: Testes que falham**

Em `server/routes/painel.test.js`:

```js
  it('conta só sites nos cartões, ignora GMN/placas na divulgação e lista o que falta entregar', async () => {
    const ctx = criarContexto({ hoje: '2026-09-23' });
    const ana = (await ctx.http.post('/api/clientes').send({ nome: 'Ana' })).body;
    await ctx.http.post('/api/projetos').send({ cliente_id: ana.id, titulo: 'Site', etapa: 'andamento' });
    const gmn = (await ctx.http.post('/api/projetos').send({
      cliente_id: ana.id, titulo: 'Google Meu Negócio', servico: 'google_meu_negocio', valor_total_centavos: 2000, vencimento: '2026-09-25',
    })).body;
    const gmnPronto = (await ctx.http.post('/api/projetos').send({ cliente_id: ana.id, titulo: 'GMN antigo', servico: 'google_meu_negocio' })).body;
    await ctx.http.put(`/api/projetos/${gmnPronto.id}`).send({ etapa: 'entregue' }).expect(200);

    const res = await ctx.http.get('/api/painel').expect(200);
    expect(res.body.cartoes.em_andamento).toBe(1);
    expect(res.body.para_entregar).toEqual({
      gmn: 1, placas: 0,
      itens: [{ projeto_id: gmn.id, cliente_id: ana.id, cliente_nome: 'Ana', servico: 'google_meu_negocio' }],
    });
    const divulgacao = [...res.body.tarefas_por_projeto.reais].filter((p) => p.projeto_id === gmnPronto.id);
    expect(divulgacao).toEqual([]);
    expect(res.body.proximos.find((i) => i.tipo === 'parcela')).toMatchObject({ servico: 'google_meu_negocio', cliente_id: ana.id });
  });
```

Em `server/domain/painel.test.js`, acrescentar um caso para `montarProximos`:

```js
  it('parcela leva servico e cliente_id para o link certo', () => {
    const [item] = montarProximos({ parcelas: [{ id: 1, projeto_id: 2, descricao: 'Pagamento', projeto_titulo: 'GMN', vencimento: '2026-09-24', valor_centavos: 100, servico: 'google_meu_negocio', cliente_id: 3 }] }, '2026-09-23');
    expect(item).toMatchObject({ tipo: 'parcela', servico: 'google_meu_negocio', cliente_id: 3 });
  });
```

(importar `montarProximos` se o arquivo ainda não importar.)

Run: `npx vitest run server/routes/painel.test.js server/domain/painel.test.js` → FAIL.

- [ ] **Step 2: Implementar**

`server/domain/painel.js` — no `map` das parcelas em `montarProximos`, acrescentar `servico: p.servico, cliente_id: p.cliente_id,` ao objeto.

`server/routes/painel.js`:
- `parcelasAbertas`: `SELECT pa.*, p.titulo AS projeto_titulo, p.servico, p.cliente_id FROM parcelas pa …` (resto igual);
- `propostas`: `"SELECT valor_total_centavos FROM projetos WHERE etapa = 'proposta' AND ficticio = 0 AND servico = 'site_sistema'"`;
- `entregas`: acrescentar `AND p.servico = 'site_sistema'` ao `WHERE`;
- consulta de divulgação (`montarTarefasDivulgacao`): `WHERE p.etapa = 'entregue' AND p.servico = 'site_sistema' AND (p.postou_instagram = 0 OR COALESCE(pf.publicar, 0) = 0)`;
- antes do `res.json`:

```js
    const paraEntregar = todas(
      `SELECT p.id AS projeto_id, p.cliente_id, c.nome AS cliente_nome, p.servico
       FROM projetos p JOIN clientes c ON c.id = p.cliente_id
       WHERE p.servico <> 'site_sistema' AND p.etapa = 'andamento' AND p.ficticio = 0
       ORDER BY c.nome COLLATE NOCASE, p.id`,
    );
```

- no objeto de resposta, depois de `cartoes`:

```js
      para_entregar: {
        gmn: paraEntregar.filter((i) => i.servico === 'google_meu_negocio').length,
        placas: paraEntregar.filter((i) => i.servico === 'placas_nfc').length,
        itens: paraEntregar,
      },
```

- [ ] **Step 3: Rodar e ver passar**

Run: `npx vitest run --project server` → PASS.

- [ ] **Step 4: Commit**

```bash
git add server/routes/painel.js server/domain/painel.js server/routes/painel.test.js server/domain/painel.test.js
git commit -m "feat: painel conta so sites e lista GMN e placas para entregar"
```

---

### Task 9: Funil, Projetos e formulário de oportunidade só com sites e sistemas

**Files:**
- Modify: `web/src/lib/rotulos.js`, `web/src/lib/rotulos.test.js`
- Modify: `web/src/components/CamposServicos.jsx`, `web/src/components/CamposServicos.test.jsx`
- Modify: `web/src/components/FormOportunidade.jsx`
- Modify: `web/src/pages/projeto/AbaGeral.jsx`, `web/src/pages/projeto/Projeto.test.jsx`
- Modify: `web/src/pages/Funil.jsx`, `web/src/pages/Funil.test.jsx`
- Modify: `web/src/pages/Projetos.jsx`, `web/src/pages/Projetos.test.jsx`

**Interfaces:**
- Produces (em `web/src/lib/rotulos.js`): `ROTULO_SERVICO = { site_sistema: 'Site/Sistema', google_meu_negocio: 'GMN', placas_nfc: 'Placas' }`, `SERVICOS`, `TIPOS_SERVICO_SITE = ['sistemas', 'saas']`, `ABA_DO_SERVICO = { site_sistema: 'sites', google_meu_negocio: 'gmn', placas_nfc: 'placas' }`. `CamposServicos({ servicos, desconto, onChange })` (sem `clienteId`/`projetoId`). `FormOportunidade({ onSalvar, ficticioFixo, clienteInicial })`.

- [ ] **Step 1: Testes que falham**

`web/src/lib/rotulos.test.js` — acrescentar (e incluir os nomes no import):

```js
describe('rótulos de serviço', () => {
  it('três serviços com rótulo e aba', () => {
    expect(SERVICOS).toEqual(['site_sistema', 'google_meu_negocio', 'placas_nfc']);
    for (const s of SERVICOS) {
      expect(ROTULO_SERVICO[s]).toBeTruthy();
      expect(ABA_DO_SERVICO[s]).toBeTruthy();
    }
    expect(TIPOS_SERVICO_SITE).toEqual(['sistemas', 'saas']);
  });
});
```

`web/src/components/CamposServicos.test.jsx`:
- **apagar** os testes que dependem de placas: "marcar \"Placas NFC\" adiciona a linha…", "trocar o modelo de placas atualiza o valor sugerido", "com cliente que já comprou…", "valor editado à mão não é sobrescrito…", "linha existente carrega o total salvo…", "se a consulta de preço falhar…", "quantidade vazia não consulta preço" e a constante `MODELO` (essa lógica migra para `FormVendaPlacas` na Task 12);
- acrescentar:

```js
  it('oferece só Sistemas e SaaS', async () => {
    mockApi({ 'GET /config': {} });
    renderizar(<CamposServicos servicos={[]} desconto={0} onChange={() => {}} />);
    expect(await screen.findByLabelText('Sistemas')).toBeInTheDocument();
    expect(screen.getByLabelText('SaaS')).toBeInTheDocument();
    expect(screen.queryByLabelText('Placas NFC')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Google Meu Negócio')).not.toBeInTheDocument();
  });
```

`web/src/pages/projeto/Projeto.test.jsx`:
- **apagar** o teste "salvar sem mexer nos serviços reenvia o total exato da linha de placas";
- em "trocar os serviços e salvar…": trocar `preco_servico_google_meu_negocio_centavos: 20000` por `preco_servico_sistemas_centavos: 20000`, o clique em `'Google Meu Negócio'` por `'Sistemas'` e o esperado por `[{ tipo: 'sistemas', valor_unitario_centavos: 20000 }]`.

`web/src/pages/Funil.test.jsx`:
- trocar toda chave `'GET /projetos?ficticio=` por `'GET /projetos?servico=site_sistema&ficticio=`:
  `sed -i "s#'GET /projetos?ficticio=#'GET /projetos?servico=site_sistema\&ficticio=#g" web/src/pages/Funil.test.jsx`
- acrescentar:

```js
  it('o nome do cliente no card leva ao perfil', async () => {
    mockApi({ 'GET /projetos?servico=site_sistema&ficticio=0': [{ ...projetos[0], cliente_id: 7 }] });
    abrir();
    expect(await screen.findByRole('link', { name: 'Ana' })).toHaveAttribute('href', '/clientes/7');
  });
```

`web/src/pages/Projetos.test.jsx`:
- trocar `'GET /projetos'` (exato) por `'GET /projetos?servico=site_sistema'` e `'GET /projetos?` por `'GET /projetos?servico=site_sistema&`:
  `sed -i -e "s#'GET /projetos?\([a-z]\)#'GET /projetos?servico=site_sistema\&\1#g" -e "s#'GET /projetos'#'GET /projetos?servico=site_sistema'#g" web/src/pages/Projetos.test.jsx`
  (a ordem importa: a troca com parâmetro roda antes da troca exata, senão a chave já prefixada ganharia `servico` duas vezes)
  (conferir com `git diff` que chamadas como `chamadas.some((c) => c.caminho === '/projetos?...')`, se existirem, também foram ajustadas).

Run: `npx vitest run web/src/lib/rotulos.test.js web/src/components/CamposServicos.test.jsx web/src/pages/Funil.test.jsx web/src/pages/Projetos.test.jsx web/src/pages/projeto/Projeto.test.jsx` → FAIL.

- [ ] **Step 2: Implementar**

`web/src/lib/rotulos.js` — acrescentar ao fim:

```js
export const ROTULO_SERVICO = { site_sistema: 'Site/Sistema', google_meu_negocio: 'GMN', placas_nfc: 'Placas' };
export const SERVICOS = Object.keys(ROTULO_SERVICO);
export const TIPOS_SERVICO_SITE = ['sistemas', 'saas'];
export const ABA_DO_SERVICO = { site_sistema: 'sites', google_meu_negocio: 'gmn', placas_nfc: 'placas' };
```

`web/src/components/CamposServicos.jsx` — substituir o arquivo inteiro:

```jsx
import { useState } from 'react';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { ROTULO_TIPO_SERVICO, TIPOS_SERVICO_SITE } from '../lib/rotulos.js';
import { paraCentavos, centavosParaTexto, formatarDinheiro } from '../lib/dinheiro.js';

function linhaInicial(tipo, config) {
  return { tipo, valor: centavosParaTexto(config?.[`preco_servico_${tipo}_centavos`] ?? 0) };
}

const linhaExistente = (s) => ({ tipo: s.tipo, valor: centavosParaTexto(s.valor_unitario_centavos ?? 0) });

function paraSaida(linhas, descontoTexto) {
  return {
    servicos: linhas.map((l) => ({ tipo: l.tipo, valor_unitario_centavos: paraCentavos(l.valor) || 0 })),
    desconto_centavos: paraCentavos(descontoTexto) || 0,
  };
}

export function CamposServicos({ servicos, desconto, onChange }) {
  const { dados: config } = useCarregar(() => api('/config'), []);
  const [linhas, setLinhas] = useState((servicos ?? []).map(linhaExistente));
  const [descontoTexto, setDescontoTexto] = useState(centavosParaTexto(desconto ?? 0));

  function aplicar(proximas, proximoDesconto = descontoTexto) {
    setLinhas(proximas);
    setDescontoTexto(proximoDesconto);
    onChange(paraSaida(proximas, proximoDesconto));
  }

  function alternar(tipo, marcado) {
    aplicar(marcado ? [...linhas, linhaInicial(tipo, config)] : linhas.filter((l) => l.tipo !== tipo));
  }

  function alterarValor(tipo, valor) {
    aplicar(linhas.map((l) => (l.tipo === tipo ? { ...l, valor } : l)));
  }

  const subtotal = linhas.reduce((soma, l) => soma + (paraCentavos(l.valor) || 0), 0);
  const total = Math.max(0, subtotal - (paraCentavos(descontoTexto) || 0));

  return (
    <div className="campos-servicos">
      <fieldset>
        <legend>Serviços</legend>
        {TIPOS_SERVICO_SITE.map((tipo) => {
          const linha = linhas.find((l) => l.tipo === tipo);
          return (
            <div className="campos-servicos__linha" key={tipo}>
              <label>
                <input type="checkbox" checked={Boolean(linha)} onChange={(e) => alternar(tipo, e.target.checked)} />{' '}
                {ROTULO_TIPO_SERVICO[tipo]}
              </label>
              {linha && (
                <input
                  aria-label={`Valor de ${ROTULO_TIPO_SERVICO[tipo]}`}
                  inputMode="decimal"
                  value={linha.valor}
                  onChange={(e) => alterarValor(tipo, e.target.value)}
                />
              )}
            </div>
          );
        })}
      </fieldset>
      <div className="campos-servicos__linha">
        <label htmlFor="campos-servicos-desconto">Desconto (R$)</label>
        <input id="campos-servicos-desconto" inputMode="decimal" value={descontoTexto} onChange={(e) => aplicar(linhas, e.target.value)} />
      </div>
      <p className="campos-servicos__total">Subtotal: {formatarDinheiro(subtotal)} — Total: {formatarDinheiro(total)}</p>
    </div>
  );
}
```

`web/src/components/FormOportunidade.jsx`:
- assinatura: `export function FormOportunidade({ onSalvar, ficticioFixo = false, clienteInicial = null })`;
- no `useFormulario`, `cliente_id: clienteInicial ? String(clienteInicial) : ''`;
- no `<CamposServicos …>`, remover a prop `clienteId={…}`.

`web/src/pages/projeto/AbaGeral.jsx`: no `<CamposServicos …>`, remover as props `clienteId` e `projetoId`.

`web/src/pages/Funil.jsx`:
- `() => api(\`/projetos?servico=site_sistema&ficticio=${ficticio ? 1 : 0}\`)`;
- no `renderItem`, trocar `<p className="kanban__meta">{p.cliente_nome}</p>` por
  `<p className="kanban__meta"><Link to={\`/clientes/${p.cliente_id}\`}>{p.cliente_nome}</Link></p>`.

`web/src/pages/Projetos.jsx`: `Object.entries({ servico: 'site_sistema', etapa, cliente_id: clienteId, postou_instagram: instagram })` (a consulta sempre existe agora; manter o restante igual).

- [ ] **Step 3: Rodar e ver passar**

Run: `npx vitest run --project web`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/rotulos.js web/src/lib/rotulos.test.js web/src/components/CamposServicos.jsx web/src/components/CamposServicos.test.jsx web/src/components/FormOportunidade.jsx web/src/pages/projeto/AbaGeral.jsx web/src/pages/projeto/Projeto.test.jsx web/src/pages/Funil.jsx web/src/pages/Funil.test.jsx web/src/pages/Projetos.jsx web/src/pages/Projetos.test.jsx
git commit -m "feat: funil e projetos so com sites e sistemas"
```

---

### Task 10: Perfil do cliente com topo e abas + aba Sites e Sistemas

**Files:**
- Rewrite: `web/src/pages/ClienteDetalhe.jsx`
- Create: `web/src/pages/cliente/AbaSites.jsx`
- Create: `web/src/test/perfilCliente.js` (fixtures dos testes do perfil — não exportar fixtures de um `.test.jsx`: importar um arquivo de teste registra os testes dele de novo)
- Test: `web/src/pages/ClienteDetalhe.test.jsx` (reescrever)

**Interfaces:**
- Consumes: `FormOportunidade({ clienteInicial })` (Task 9), `GET /projetos?cliente_id=:id` (devolve `servico`, `servicos`, `qrcodes`).
- Produces (testes): `web/src/test/perfilCliente.js` exporta `clienteExemplo`, `site`, `gmn`, `rotasPerfil(extra)`.
- Produces: `ClienteDetalhe` carrega `cliente` (`GET /clientes/:id`) e `projetos` (`GET /projetos?cliente_id=:id`) e renderiza `<AbaSites cliente projetos />`, `<AbaGmn cliente projetos onMudou />`, `<AbaPlacas cliente projetos onMudou />` (as duas últimas chegam nas Tasks 11 e 12; nesta task, as abas GMN e Placas mostram só `<p className="vazio">Em breve.</p>`).

- [ ] **Step 1: Reescrever o teste**

`web/src/test/perfilCliente.js`:

```js
export const clienteExemplo = {
  id: 1, nome: 'Ana', empresa: 'Padaria da Ana', email: null, telefone: '11 99999-0000', instagram: null, origem: null, notas: null,
  atualizado_em: 'T', total_faturado_centavos: 150050, projetos: [],
  qrcodes: [{ id: 5, nome: 'QR balcão' }],
};
export const site = { id: 4, titulo: 'Site', etapa: 'andamento', servico: 'site_sistema', valor_total_centavos: 300000, servicos: [], qrcodes: [] };
export const gmn = {
  id: 6, titulo: 'Google Meu Negócio', etapa: 'andamento', servico: 'google_meu_negocio', valor_total_centavos: 20000,
  link_perfil: 'https://g.page/ana', notas: null, mensalidade_ativa: 0, servicos: [], qrcodes: [], atualizado_em: 'T',
};

export function rotasPerfil(extra = {}) {
  return {
    'GET /clientes/1': clienteExemplo,
    'GET /projetos?cliente_id=1': [site, gmn],
    'GET /clientes/1/placas': { vendas_avulsas: [], ja_comprou: 0 },
    'GET /projetos/6/parcelas': { parcelas: [], resumo: {} },
    ...extra,
  };
}
```

`web/src/pages/ClienteDetalhe.test.jsx` — substituir o arquivo inteiro:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClienteDetalhe } from './ClienteDetalhe.jsx';
import { mockApi, resposta } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';
import { rotasPerfil, clienteExemplo } from '../test/perfilCliente.js';

const abrir = (rota = '/clientes/1') => renderizar(<ClienteDetalhe />, { rota, padrao: '/clientes/:id' });

describe('ClienteDetalhe', () => {
  it('mostra o topo com contato e total faturado e abre na aba Sites e Sistemas', async () => {
    mockApi(rotasPerfil());
    abrir();
    expect(await screen.findByRole('heading', { name: 'Ana' })).toBeInTheDocument();
    expect(screen.getByText(/Padaria da Ana · 11 99999-0000/)).toBeInTheDocument();
    expect(screen.getByText(/1\.500,50/)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Sites e Sistemas (1)' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Google Meu Negócio (1)' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Placas NFC (0)' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Site' })).toHaveAttribute('href', '/projetos/4');
    expect(screen.getByText('Em andamento')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Google Meu Negócio' })).not.toBeInTheDocument();
  });

  it('abre a aba indicada em ?aba= e troca de aba', async () => {
    mockApi(rotasPerfil());
    abrir('/clientes/1?aba=gmn');
    expect(await screen.findByRole('tab', { name: 'Google Meu Negócio (1)' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Sites e Sistemas (1)' }));
    expect(screen.getByRole('link', { name: 'Site' })).toBeInTheDocument();
  });

  it('+ Nova oportunidade abre o formulário com o cliente preenchido', async () => {
    mockApi(rotasPerfil({ 'GET /clientes': [{ id: 1, nome: 'Ana' }], 'GET /config': {} }));
    abrir();
    await userEvent.setup().click(await screen.findByRole('button', { name: '+ Nova oportunidade' }));
    expect(await screen.findByRole('option', { name: 'Ana' })).toBeInTheDocument();
    expect(screen.getByLabelText('Cliente')).toHaveValue('1');
  });

  it('Editar dados salva e recarrega', async () => {
    const { chamadas } = mockApi(rotasPerfil({ 'PUT /clientes/1': { ...clienteExemplo, nome: 'Ana Souza' } }));
    abrir();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Editar dados' }));
    const nome = screen.getByLabelText('Nome');
    await user.clear(nome);
    await user.type(nome, 'Ana Souza');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(chamadas.find((c) => c.metodo === 'PUT').corpo.nome).toBe('Ana Souza');
  });

  it('mostra a mensagem quando o servidor recusa a exclusão', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockApi(rotasPerfil({ 'DELETE /clientes/1': resposta(409, { erro: 'Este cliente tem projetos.' }) }));
    abrir();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Excluir' }));
    expect(await screen.findByText('Este cliente tem projetos.')).toBeInTheDocument();
  });
});
```

Run: `npx vitest run web/src/pages/ClienteDetalhe.test.jsx` → FAIL.

- [ ] **Step 2: Implementar**

`web/src/pages/cliente/AbaSites.jsx`:

```jsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../../api/client.js';
import { Modal } from '../../components/Modal.jsx';
import { FormOportunidade } from '../../components/FormOportunidade.jsx';
import { formatarDinheiro } from '../../lib/dinheiro.js';
import { ROTULO_ETAPA } from '../../lib/rotulos.js';

export function AbaSites({ cliente, projetos }) {
  const [criando, setCriando] = useState(false);
  const navegar = useNavigate();

  async function criar(dados) {
    const projeto = await api('/projetos', { method: 'POST', body: dados });
    navegar(`/projetos/${projeto.id}`);
  }

  return (
    <div className="cartao">
      <div className="pagina__topo">
        <h2>Sites e Sistemas</h2>
        <button type="button" className="btn btn--primario" onClick={() => setCriando(true)}>+ Nova oportunidade</button>
      </div>
      {projetos.length ? (
        <ul className="lista">
          {projetos.map((p) => (
            <li key={p.id}>
              <Link to={`/projetos/${p.id}`}>{p.titulo}</Link>
              <span className={`etiqueta etiqueta--${p.etapa}`}>{ROTULO_ETAPA[p.etapa]}</span>
              <span>{formatarDinheiro(p.valor_total_centavos)}</span>
            </li>
          ))}
        </ul>
      ) : <p className="vazio">Nenhum site ou sistema ainda.</p>}
      {criando && (
        <Modal titulo="Nova oportunidade" onFechar={() => setCriando(false)}>
          <FormOportunidade onSalvar={criar} clienteInicial={cliente.id} />
        </Modal>
      )}
    </div>
  );
}
```

`web/src/pages/ClienteDetalhe.jsx` — substituir o arquivo inteiro:

```jsx
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Aviso } from '../components/Aviso.jsx';
import { Modal } from '../components/Modal.jsx';
import { FormCliente } from '../components/FormCliente.jsx';
import { formatarDinheiro } from '../lib/dinheiro.js';
import { AbaSites } from './cliente/AbaSites.jsx';

const ABAS = [
  ['sites', 'Sites e Sistemas', 'site_sistema'],
  ['gmn', 'Google Meu Negócio', 'google_meu_negocio'],
  ['placas', 'Placas NFC', 'placas_nfc'],
];

export function ClienteDetalhe() {
  const { id } = useParams();
  const navegar = useNavigate();
  const [params, setParams] = useSearchParams();
  const aba = ABAS.some(([chave]) => chave === params.get('aba')) ? params.get('aba') : 'sites';
  const { dados: cliente, erro, recarregar } = useCarregar(() => api(`/clientes/${id}`), [id]);
  const { dados: projetos, erro: erroProjetos, recarregar: recarregarProjetos } = useCarregar(
    () => api(`/projetos?cliente_id=${id}`), [id],
  );
  const [editando, setEditando] = useState(false);
  const exclusao = useEnvio();

  if (erro || erroProjetos) return <Aviso erro={erro ?? erroProjetos} />;
  if (!cliente || !projetos) return <p>Carregando…</p>;

  const doServico = (servico) => projetos.filter((p) => p.servico === servico);
  const contato = [cliente.empresa, cliente.telefone, cliente.email, cliente.instagram].filter(Boolean).join(' · ');

  async function salvar(dados) {
    await api(`/clientes/${id}`, { method: 'PUT', body: dados });
    setEditando(false);
    recarregar();
  }

  function excluir() {
    if (!window.confirm(`Excluir o cliente ${cliente.nome}?`)) return;
    exclusao.executar(async () => {
      await api(`/clientes/${id}`, { method: 'DELETE' });
      navegar('/clientes');
    });
  }

  function mudou() {
    recarregar();
    recarregarProjetos();
  }

  return (
    <section>
      <header className="pagina__topo">
        <div>
          <p className="sobretitulo"><Link to="/clientes">Clientes</Link></p>
          <h1>{cliente.nome}</h1>
          {contato && <p className="vazio">{contato}</p>}
          <p>Total faturado: <strong>{formatarDinheiro(cliente.total_faturado_centavos)}</strong></p>
        </div>
        <div>
          <button type="button" className="btn" onClick={() => setEditando(true)}>Editar dados</button>{' '}
          <button type="button" className="btn btn--perigo" onClick={excluir}>Excluir</button>
        </div>
      </header>
      <Aviso erro={exclusao.erro} />
      <div role="tablist" className="abas">
        {ABAS.map(([chave, rotulo, servico]) => (
          <button
            key={chave} role="tab" type="button" className="abas__aba" aria-selected={aba === chave}
            onClick={() => setParams({ aba: chave })}
          >
            {`${rotulo} (${doServico(servico).length})`}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {aba === 'sites' && <AbaSites cliente={cliente} projetos={doServico('site_sistema')} />}
        {aba === 'gmn' && <p className="vazio">Em breve.</p>}
        {aba === 'placas' && <p className="vazio">Em breve.</p>}
      </div>
      {editando && (
        <Modal titulo="Editar dados" onFechar={() => setEditando(false)}>
          <FormCliente inicial={cliente} onSalvar={salvar} />
        </Modal>
      )}
    </section>
  );
}
```

(`mudou` fica sem uso até a Task 11, que o passa como `onMudou`. Se o lint reclamar, criar `mudou` só na Task 11.)

- [ ] **Step 3: Rodar e ver passar**

Run: `npx vitest run web/src/pages/ClienteDetalhe.test.jsx` → PASS.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/ClienteDetalhe.jsx web/src/pages/ClienteDetalhe.test.jsx web/src/pages/cliente/AbaSites.jsx web/src/test/perfilCliente.js
git commit -m "feat: perfil do cliente com abas por servico e aba de sites"
```

---

### Task 11: Aba Google Meu Negócio

**Files:**
- Create: `web/src/hooks/useParcelas.js`
- Create: `web/src/pages/cliente/CobrancaServico.jsx`
- Create: `web/src/components/FormGmn.jsx`
- Create: `web/src/pages/cliente/AbaGmn.jsx`
- Modify: `web/src/pages/ClienteDetalhe.jsx`
- Test: `web/src/pages/cliente/AbaGmn.test.jsx`

**Interfaces:**
- Consumes: `rotasPerfil`, `gmn` de `web/src/test/perfilCliente.js` (Task 10); `PUT /parcelas/:id`, `GET /projetos/:id/parcelas`.
- Produces:
  - `useParcelas(projeto) → { parcelas: Array|null, recarregar }` (recarrega quando `projeto.atualizado_em` muda);
  - `parcelaUnica(parcelas) → parcela | null` (única parcela não-mensalidade, ou `null` se houver 0 ou mais de 1) — exportada de `web/src/hooks/useParcelas.js`;
  - `<CobrancaServico projeto parcelas onPago />` — mostra "R$ X · pago", "R$ X · a receber (vence dd/mm)" + botão "Marcar pago", ou "R$ X/mês, dia N";
  - `FormGmn({ clienteId, projeto = null, parcela = null, onSalvar })` — `onSalvar(corpo)`; na criação o corpo inclui `servico: 'google_meu_negocio'`, `titulo: 'Google Meu Negócio'`, `cliente_id`.

- [ ] **Step 1: Testes que falham**

`web/src/pages/cliente/AbaGmn.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClienteDetalhe } from '../ClienteDetalhe.jsx';
import { mockApi, resposta } from '../../test/mockApi.js';
import { renderizar } from '../../test/renderizar.jsx';
import { rotasPerfil, gmn } from '../../test/perfilCliente.js';
import { hojeISO } from '../../lib/datas.js';

const parcelaAberta = { id: 30, descricao: 'Pagamento', valor_centavos: 20000, vencimento: '2026-10-05', pago_em: null, mensalidade: 0 };
const abrir = () => renderizar(<ClienteDetalhe />, { rota: '/clientes/1?aba=gmn', padrao: '/clientes/:id' });
const cartao = async () => (await screen.findByRole('link', { name: 'https://g.page/ana' })).closest('li');

describe('Aba Google Meu Negócio', () => {
  it('cartão mostra pendente, link e cobrança a receber; marca pago e configurado', async () => {
    const { chamadas } = mockApi(rotasPerfil({
      'GET /projetos/6/parcelas': { parcelas: [parcelaAberta], resumo: {} },
      'PUT /parcelas/30': { ...parcelaAberta, pago_em: hojeISO() },
      'PUT /projetos/6': { ...gmn, etapa: 'entregue' },
    }));
    abrir();
    const item = await cartao();
    expect(within(item).getByText('Pendente')).toBeInTheDocument();
    expect(within(item).getByText(/R\$\s200,00 · a receber \(vence 05\/10\/2026\)/)).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(within(item).getByRole('button', { name: 'Marcar pago' }));
    expect(chamadas.find((c) => c.metodo === 'PUT' && c.caminho === '/parcelas/30').corpo).toEqual({ pago_em: hojeISO() });
    await user.click(within(item).getByRole('button', { name: 'Marcar configurado' }));
    expect(chamadas.find((c) => c.caminho === '/projetos/6' && c.metodo === 'PUT').corpo).toEqual({ etapa: 'entregue' });
  });

  it('configurado mostra a data; mensalidade mostra valor por mês', async () => {
    mockApi(rotasPerfil({
      'GET /projetos?cliente_id=1': [{ ...gmn, etapa: 'entregue', data_entrega: '2026-09-20', mensalidade_ativa: 1, mensalidade_valor_centavos: 5000, mensalidade_dia_vencimento: 10, valor_total_centavos: 0 }],
    }));
    abrir();
    const item = await cartao();
    expect(within(item).getByText('Configurado em 20/09/2026')).toBeInTheDocument();
    expect(within(item).getByText(/R\$\s50,00\/mês, dia 10/)).toBeInTheDocument();
  });

  it('+ Google Meu Negócio cria com cobrança única', async () => {
    const { chamadas } = mockApi(rotasPerfil({ 'POST /projetos': { ...gmn, id: 9 } }));
    abrir();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '+ Google Meu Negócio' }));
    const dialogo = screen.getByRole('dialog');
    await user.type(within(dialogo).getByLabelText('Valor (R$)'), '200');
    await user.type(within(dialogo).getByLabelText('Vencimento'), '2026-10-05');
    await user.type(within(dialogo).getByLabelText('Link do perfil'), 'https://g.page/ana');
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }));
    expect(chamadas.find((c) => c.metodo === 'POST').corpo).toEqual({
      servico: 'google_meu_negocio', titulo: 'Google Meu Negócio', cliente_id: 1,
      valor_total_centavos: 20000, vencimento: '2026-10-05', mensalidade_ativa: false,
      link_perfil: 'https://g.page/ana', notas: '',
    });
  });

  it('cria com mensalidade', async () => {
    const { chamadas } = mockApi(rotasPerfil({ 'POST /projetos': { ...gmn, id: 9 } }));
    abrir();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '+ Google Meu Negócio' }));
    const dialogo = screen.getByRole('dialog');
    await user.click(within(dialogo).getByLabelText('Mensalidade'));
    await user.type(within(dialogo).getByLabelText('Valor (R$)'), '50');
    await user.type(within(dialogo).getByLabelText('Dia do vencimento'), '10');
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }));
    expect(chamadas.find((c) => c.metodo === 'POST').corpo).toMatchObject({
      valor_total_centavos: 0, mensalidade_ativa: true, mensalidade_valor_centavos: 5000, mensalidade_dia_vencimento: 10,
    });
  });

  it('editar com cobrança já paga trava o valor', async () => {
    mockApi(rotasPerfil({ 'GET /projetos/6/parcelas': { parcelas: [{ ...parcelaAberta, pago_em: '2026-10-01' }], resumo: {} } }));
    abrir();
    const item = await cartao();
    expect(within(item).getByText(/· pago/)).toBeInTheDocument();
    await userEvent.setup().click(within(item).getByRole('button', { name: 'Editar' }));
    expect(within(screen.getByRole('dialog')).getByLabelText('Valor (R$)')).toBeDisabled();
  });

  it('excluir pede confirmação e chama DELETE', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { chamadas } = mockApi(rotasPerfil({ 'DELETE /projetos/6': resposta(204) }));
    abrir();
    await userEvent.setup().click(within(await cartao()).getByRole('button', { name: 'Excluir' }));
    expect(chamadas.some((c) => c.metodo === 'DELETE' && c.caminho === '/projetos/6')).toBe(true);
  });
});
```

Run: `npx vitest run web/src/pages/cliente/AbaGmn.test.jsx` → FAIL.

- [ ] **Step 2: Implementar o hook e a cobrança**

`web/src/hooks/useParcelas.js`:

```js
import { api } from '../api/client.js';
import { useCarregar } from './useCarregar.js';

export function useParcelas(projeto) {
  const { dados, recarregar } = useCarregar(
    () => api(`/projetos/${projeto.id}/parcelas`), [projeto.id, projeto.atualizado_em],
  );
  return { parcelas: dados?.parcelas ?? null, recarregar };
}

export function parcelaUnica(parcelas) {
  const avulsas = (parcelas ?? []).filter((p) => !p.mensalidade);
  return avulsas.length === 1 ? avulsas[0] : null;
}
```

`web/src/pages/cliente/CobrancaServico.jsx`:

```jsx
import { api } from '../../api/client.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { Aviso } from '../../components/Aviso.jsx';
import { formatarDinheiro } from '../../lib/dinheiro.js';
import { formatarData, hojeISO } from '../../lib/datas.js';

export function CobrancaServico({ projeto, parcelas, onPago }) {
  const envio = useEnvio();
  if (!parcelas) return null;
  const valor = projeto.mensalidade_ativa
    ? `${formatarDinheiro(projeto.mensalidade_valor_centavos)}/mês, dia ${projeto.mensalidade_dia_vencimento}`
    : formatarDinheiro(projeto.valor_total_centavos);
  const abertas = parcelas.filter((p) => !p.pago_em);
  const [proxima] = abertas;

  function marcarPago() {
    envio.executar(async () => {
      await api(`/parcelas/${proxima.id}`, { method: 'PUT', body: { pago_em: hojeISO() } });
      onPago();
    });
  }

  let situacao = '';
  if (proxima) situacao = ` · a receber (vence ${formatarData(proxima.vencimento)})`;
  else if (parcelas.length) situacao = ' · pago';

  return (
    <span>
      {valor}{situacao}
      {proxima && (
        <>{' '}<button type="button" className="btn btn--fantasma btn--pequeno" onClick={marcarPago} disabled={envio.enviando}>Marcar pago</button></>
      )}
      <Aviso erro={envio.erro} />
    </span>
  );
}
```

- [ ] **Step 3: Implementar o formulário**

`web/src/components/FormGmn.jsx`:

```jsx
import { useFormulario } from '../hooks/useFormulario.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Campo } from './Campo.jsx';
import { Aviso } from './Aviso.jsx';
import { paraCentavos, centavosParaTexto } from '../lib/dinheiro.js';

export function FormGmn({ clienteId, projeto = null, parcela = null, onSalvar }) {
  const mensal = Boolean(projeto?.mensalidade_ativa);
  const { valores, campo, setValores } = useFormulario({
    cobranca: mensal ? 'mensal' : 'unica',
    valor: projeto ? centavosParaTexto(mensal ? projeto.mensalidade_valor_centavos : projeto.valor_total_centavos) : '',
    vencimento: parcela?.vencimento ?? '',
    dia: projeto?.mensalidade_dia_vencimento ? String(projeto.mensalidade_dia_vencimento) : '',
    link_perfil: projeto?.link_perfil ?? '',
    notas: projeto?.notas ?? '',
  });
  const { erros, erro, enviando, executar, setErros } = useEnvio();
  const valorTravado = Boolean(parcela?.pago_em) && valores.cobranca === 'unica';

  function enviar(e) {
    e.preventDefault();
    const valor = paraCentavos(valores.valor);
    if (Number.isNaN(valor)) {
      setErros([{ campo: 'valor', mensagem: 'Valor inválido' }]);
      return;
    }
    const corpo = projeto ? {} : { servico: 'google_meu_negocio', titulo: 'Google Meu Negócio', cliente_id: clienteId };
    if (valores.cobranca === 'mensal') {
      Object.assign(corpo, {
        valor_total_centavos: 0, mensalidade_ativa: true,
        mensalidade_valor_centavos: valor ?? 0, mensalidade_dia_vencimento: Number(valores.dia) || null,
      });
    } else {
      Object.assign(corpo, { valor_total_centavos: valor ?? 0, vencimento: valores.vencimento, mensalidade_ativa: false });
    }
    Object.assign(corpo, { link_perfil: valores.link_perfil, notas: valores.notas });
    executar(() => onSalvar(corpo));
  }

  return (
    <form onSubmit={enviar} className="form" noValidate>
      <fieldset className="campo">
        <legend>Cobrança</legend>
        <label>
          <input type="radio" name="cobranca" value="unica" checked={valores.cobranca === 'unica'} onChange={() => setValores((v) => ({ ...v, cobranca: 'unica' }))} /> Única
        </label>{' '}
        <label>
          <input type="radio" name="cobranca" value="mensal" checked={valores.cobranca === 'mensal'} onChange={() => setValores((v) => ({ ...v, cobranca: 'mensal' }))} /> Mensalidade
        </label>
      </fieldset>
      <Campo rotulo="Valor (R$)" nome="valor" erros={erros} inputMode="decimal" placeholder="0,00" disabled={valorTravado} {...campo('valor')} />
      {valorTravado && <p className="vazio">Já pago — o valor não muda mais.</p>}
      {valores.cobranca === 'unica'
        ? <Campo rotulo="Vencimento" nome="vencimento" erros={erros} type="date" {...campo('vencimento')} />
        : <Campo rotulo="Dia do vencimento" nome="mensalidade_dia_vencimento" erros={erros} type="number" min="1" max="31" {...campo('dia')} />}
      <Campo rotulo="Link do perfil" nome="link_perfil" erros={erros} {...campo('link_perfil')} />
      <Campo rotulo="Observações" nome="notas" erros={erros}>
        <textarea rows={3} {...campo('notas')} />
      </Campo>
      <Aviso erro={erro} />
      <div><button className="btn btn--primario" disabled={enviando}>Salvar</button></div>
    </form>
  );
}
```

- [ ] **Step 4: Implementar a aba**

`web/src/pages/cliente/AbaGmn.jsx`:

```jsx
import { useState } from 'react';
import { api } from '../../api/client.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { useParcelas, parcelaUnica } from '../../hooks/useParcelas.js';
import { Aviso } from '../../components/Aviso.jsx';
import { Modal } from '../../components/Modal.jsx';
import { FormGmn } from '../../components/FormGmn.jsx';
import { formatarData } from '../../lib/datas.js';
import { CobrancaServico } from './CobrancaServico.jsx';

function CartaoGmn({ clienteId, projeto, onMudou }) {
  const { parcelas, recarregar } = useParcelas(projeto);
  const [editando, setEditando] = useState(false);
  const envio = useEnvio();

  function marcarConfigurado() {
    envio.executar(async () => {
      await api(`/projetos/${projeto.id}`, { method: 'PUT', body: { etapa: 'entregue' } });
      onMudou();
    });
  }

  function excluir() {
    if (!window.confirm('Excluir este Google Meu Negócio? As parcelas dele também serão excluídas.')) return;
    envio.executar(async () => {
      await api(`/projetos/${projeto.id}`, { method: 'DELETE' });
      onMudou();
    });
  }

  async function salvar(corpo) {
    await api(`/projetos/${projeto.id}`, { method: 'PUT', body: corpo });
    setEditando(false);
    onMudou();
  }

  return (
    <li className="cartao" style={{ display: 'block' }}>
      <p>
        {projeto.etapa === 'entregue'
          ? <span className="etiqueta etiqueta--entregue">{`Configurado em ${formatarData(projeto.data_entrega)}`}</span>
          : <>
              <span className="etiqueta etiqueta--andamento">Pendente</span>{' '}
              <button type="button" className="btn btn--fantasma btn--pequeno" onClick={marcarConfigurado}>Marcar configurado</button>
            </>}
      </p>
      {projeto.link_perfil && <p><a href={projeto.link_perfil} target="_blank" rel="noreferrer">{projeto.link_perfil}</a></p>}
      <p><CobrancaServico projeto={projeto} parcelas={parcelas} onPago={() => { recarregar(); onMudou(); }} /></p>
      {projeto.notas && <p className="vazio">{projeto.notas}</p>}
      <p>
        <button type="button" className="btn" onClick={() => setEditando(true)}>Editar</button>{' '}
        <button type="button" className="btn btn--perigo" onClick={excluir}>Excluir</button>
      </p>
      <Aviso erro={envio.erro} />
      {editando && (
        <Modal titulo="Editar Google Meu Negócio" onFechar={() => setEditando(false)}>
          <FormGmn clienteId={clienteId} projeto={projeto} parcela={parcelaUnica(parcelas)} onSalvar={salvar} />
        </Modal>
      )}
    </li>
  );
}

export function AbaGmn({ cliente, projetos, onMudou }) {
  const [criando, setCriando] = useState(false);

  async function criar(corpo) {
    await api('/projetos', { method: 'POST', body: corpo });
    setCriando(false);
    onMudou();
  }

  return (
    <div>
      <div className="pagina__topo">
        <h2>Google Meu Negócio</h2>
        <button type="button" className="btn btn--primario" onClick={() => setCriando(true)}>+ Google Meu Negócio</button>
      </div>
      {projetos.length ? (
        <ul className="lista">
          {projetos.map((p) => <CartaoGmn key={p.id} clienteId={cliente.id} projeto={p} onMudou={onMudou} />)}
        </ul>
      ) : <p className="vazio">Nenhum Google Meu Negócio ainda.</p>}
      {criando && (
        <Modal titulo="Novo Google Meu Negócio" onFechar={() => setCriando(false)}>
          <FormGmn clienteId={cliente.id} onSalvar={criar} />
        </Modal>
      )}
    </div>
  );
}
```

Em `web/src/pages/ClienteDetalhe.jsx`: importar `AbaGmn` de `./cliente/AbaGmn.jsx` e trocar a linha da aba GMN por
`{aba === 'gmn' && <AbaGmn cliente={cliente} projetos={doServico('google_meu_negocio')} onMudou={mudou} />}`.

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run web/src/pages/cliente/AbaGmn.test.jsx web/src/pages/ClienteDetalhe.test.jsx` → PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/hooks/useParcelas.js web/src/pages/cliente/CobrancaServico.jsx web/src/components/FormGmn.jsx web/src/pages/cliente/AbaGmn.jsx web/src/pages/cliente/AbaGmn.test.jsx web/src/pages/ClienteDetalhe.jsx
git commit -m "feat: aba Google Meu Negocio no perfil do cliente"
```

---

### Task 12: Aba Placas NFC

**Files:**
- Create: `web/src/hooks/usePrecoSugeridoPlacas.js`
- Create: `web/src/components/FormVendaPlacas.jsx`
- Test: `web/src/components/FormVendaPlacas.test.jsx`
- Create: `web/src/pages/cliente/AbaPlacas.jsx`
- Test: `web/src/pages/cliente/AbaPlacas.test.jsx`
- Modify: `web/src/pages/ClienteDetalhe.jsx`

**Interfaces:**
- Consumes: `useParcelas`, `parcelaUnica`, `CobrancaServico` (Task 11); `GET /clientes/:id/placas` (Task 6); `GET /placas/modelos/:id/preco?quantidade=&cliente_id=&projeto_id=`; `apenasAtivos` de `web/src/lib/ativos.js`.
- Produces:
  - `usePrecoSugeridoPlacas({ modeloId, quantidade, clienteId, projetoId }) → sugerido | null` (`sugerido = { total_centavos, ja_comprou, recompra, preco_por_placa_centavos }`);
  - `FormVendaPlacas({ cliente, projeto = null, parcela = null, onSalvar })` — corpo de criação: `{ servico: 'placas_nfc', titulo: 'Placas NFC', cliente_id, servicos: [{ tipo: 'placas_nfc', modelo_id, quantidade, valor_total_centavos }], vencimento, qrcodes, notas }`; na edição sem `servico/titulo/cliente_id`, e sem `servicos` quando a linha já tem `venda_id`.

- [ ] **Step 1: Testes do formulário que falham**

`web/src/components/FormVendaPlacas.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormVendaPlacas } from './FormVendaPlacas.jsx';
import { mockApi } from '../test/mockApi.js';
import { renderizar } from '../test/renderizar.jsx';

const cliente = { id: 1, qrcodes: [{ id: 3, nome: 'Balcão' }, { id: 5, nome: 'Mesa' }] };
const modelos = [{ id: 2, nome: 'Placa 10x15', ativo: 1, preco_venda_centavos: 10000 }];
const preco = (total, extra = {}) => ({ total_centavos: total, ja_comprou: 0, recompra: false, preco_por_placa_centavos: [], ...extra });

describe('FormVendaPlacas', () => {
  it('sugere o preço de pack, permite escolher QRs e envia a venda', async () => {
    mockApi({
      'GET /placas/modelos': modelos,
      'GET /placas/modelos/2/preco?quantidade=1&cliente_id=1': preco(10000),
      'GET /placas/modelos/2/preco?quantidade=3&cliente_id=1': preco(25000),
    });
    const enviados = [];
    renderizar(<FormVendaPlacas cliente={cliente} onSalvar={(c) => enviados.push(c)} />);
    const user = userEvent.setup();
    expect(await screen.findByLabelText('Modelo da placa')).toHaveValue('2');
    const quantidade = screen.getByLabelText('Quantidade');
    await user.clear(quantidade);
    await user.type(quantidade, '3');
    expect(await screen.findByDisplayValue('250,00')).toBeInTheDocument();
    expect(screen.getByText('Preço de pack')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Vencimento'), '2026-10-05');
    await user.click(screen.getByLabelText('#5 Mesa'));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(enviados.at(-1)).toEqual({
      servico: 'placas_nfc', titulo: 'Placas NFC', cliente_id: 1,
      servicos: [{ tipo: 'placas_nfc', modelo_id: 2, quantidade: 3, valor_total_centavos: 25000 }],
      vencimento: '2026-10-05', qrcodes: [5], notas: '',
    });
  });

  it('cliente que já comprou mostra a etiqueta de recompra', async () => {
    mockApi({
      'GET /placas/modelos': modelos,
      'GET /placas/modelos/2/preco?quantidade=1&cliente_id=1': preco(9000, { ja_comprou: 4, recompra: true }),
    });
    renderizar(<FormVendaPlacas cliente={cliente} onSalvar={() => {}} />);
    expect(await screen.findByText('Cliente já comprou 4 placas — preço de recompra')).toBeInTheDocument();
    expect(screen.getByLabelText('Valor total')).toHaveValue('90,00');
  });

  it('valor digitado à mão não é sobrescrito; o botão restaura o sugerido', async () => {
    mockApi({
      'GET /placas/modelos': modelos,
      'GET /placas/modelos/2/preco?quantidade=1&cliente_id=1': preco(10000),
    });
    renderizar(<FormVendaPlacas cliente={cliente} onSalvar={() => {}} />);
    const user = userEvent.setup();
    const valor = await screen.findByLabelText('Valor total');
    await screen.findByDisplayValue('100,00');
    await user.clear(valor);
    await user.type(valor, '80');
    await user.click(screen.getByRole('button', { name: /usar preço sugerido/ }));
    expect(valor).toHaveValue('100,00');
  });

  it('se a consulta de preço falhar, mantém o valor e deixa salvar', async () => {
    mockApi({ 'GET /placas/modelos': modelos });
    renderizar(<FormVendaPlacas cliente={cliente} onSalvar={() => {}} />);
    expect(await screen.findByLabelText('Valor total')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled();
  });

  it('venda entregue trava modelo, quantidade e valor e não reenvia a linha', async () => {
    mockApi({ 'GET /placas/modelos': modelos });
    const projeto = {
      id: 8, notas: null, qrcodes: [{ id: 3, nome: 'Balcão' }],
      servicos: [{ tipo: 'placas_nfc', modelo_id: 2, quantidade: 3, valor_total_centavos: 25000, venda_id: 11 }],
    };
    const enviados = [];
    renderizar(<FormVendaPlacas cliente={cliente} projeto={projeto} onSalvar={(c) => enviados.push(c)} />);
    const user = userEvent.setup();
    expect(await screen.findByLabelText('Modelo da placa')).toBeDisabled();
    expect(screen.getByLabelText('Quantidade')).toBeDisabled();
    expect(screen.getByLabelText('Valor total')).toBeDisabled();
    expect(screen.getByLabelText('#3 Balcão')).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(enviados.at(-1)).toEqual({ vencimento: '', qrcodes: [3], notas: '' });
  });
});
```

Run: `npx vitest run web/src/components/FormVendaPlacas.test.jsx` → FAIL.

- [ ] **Step 2: Implementar o hook e o formulário**

`web/src/hooks/usePrecoSugeridoPlacas.js`:

```js
import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

export function usePrecoSugeridoPlacas({ modeloId, quantidade, clienteId, projetoId }) {
  const [sugerido, setSugerido] = useState(null);
  const valida = Boolean(modeloId) && Number.isInteger(quantidade) && quantidade >= 1;
  const chave = valida ? `${modeloId}|${quantidade}|${clienteId ?? ''}|${projetoId ?? ''}` : null;

  useEffect(() => {
    setSugerido(null);
    if (!chave) return undefined;
    let ativo = true;
    const params = new URLSearchParams({ quantidade: String(quantidade) });
    if (clienteId) params.set('cliente_id', String(clienteId));
    if (projetoId) params.set('projeto_id', String(projetoId));
    api(`/placas/modelos/${modeloId}/preco?${params}`).then((dados) => ativo && setSugerido(dados), () => {});
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  return sugerido;
}
```

`web/src/components/FormVendaPlacas.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { usePrecoSugeridoPlacas } from '../hooks/usePrecoSugeridoPlacas.js';
import { Campo } from './Campo.jsx';
import { Aviso } from './Aviso.jsx';
import { apenasAtivos } from '../lib/ativos.js';
import { paraCentavos, centavosParaTexto, formatarDinheiro } from '../lib/dinheiro.js';

function etiquetaPreco(sugerido, quantidade) {
  if (!sugerido) return null;
  if (sugerido.recompra) {
    const n = sugerido.ja_comprou;
    return `Cliente já comprou ${n} ${n === 1 ? 'placa' : 'placas'} — preço de recompra`;
  }
  return quantidade >= 2 ? 'Preço de pack' : null;
}

export function FormVendaPlacas({ cliente, projeto = null, parcela = null, onSalvar }) {
  const linha = projeto?.servicos?.find((s) => s.tipo === 'placas_nfc') ?? null;
  const entregue = Boolean(linha?.venda_id);
  const { dados: modelos } = useCarregar(() => api('/placas/modelos'), []);
  const [modeloId, setModeloId] = useState(linha ? String(linha.modelo_id) : '');
  const [quantidadeTexto, setQuantidadeTexto] = useState(String(linha?.quantidade ?? 1));
  const [valor, setValor] = useState(linha ? centavosParaTexto(linha.valor_total_centavos) : '');
  const [manual, setManual] = useState(Boolean(linha));
  const [vencimento, setVencimento] = useState(parcela?.vencimento ?? '');
  const [qrcodes, setQrcodes] = useState((projeto?.qrcodes ?? []).map((q) => q.id));
  const [notas, setNotas] = useState(projeto?.notas ?? '');
  const { erros, erro, enviando, executar, setErros } = useEnvio();
  const quantidade = Number(quantidadeTexto);

  useEffect(() => {
    if (!modeloId && modelos) {
      const [primeiro] = apenasAtivos(modelos);
      if (primeiro) setModeloId(String(primeiro.id));
    }
  }, [modelos, modeloId]);

  const sugerido = usePrecoSugeridoPlacas({
    modeloId: entregue ? null : modeloId, quantidade, clienteId: cliente.id, projetoId: projeto?.id ?? null,
  });

  useEffect(() => {
    if (sugerido && !manual) setValor(centavosParaTexto(sugerido.total_centavos));
  }, [sugerido, manual]);

  function alternarQr(qrId, marcado) {
    setQrcodes((atuais) => (marcado ? [...atuais, qrId] : atuais.filter((q) => q !== qrId)));
  }

  function enviar(e) {
    e.preventDefault();
    const corpo = projeto ? {} : { servico: 'placas_nfc', titulo: 'Placas NFC', cliente_id: cliente.id };
    if (!entregue) {
      const valorCentavos = paraCentavos(valor);
      if (Number.isNaN(valorCentavos)) {
        setErros([{ campo: 'valor', mensagem: 'Valor inválido' }]);
        return;
      }
      corpo.servicos = [{ tipo: 'placas_nfc', modelo_id: Number(modeloId) || null, quantidade: quantidade || 1, valor_total_centavos: valorCentavos ?? 0 }];
    }
    Object.assign(corpo, { vencimento, qrcodes, notas });
    executar(() => onSalvar(corpo));
  }

  const sugeridoDiferente = manual && sugerido && paraCentavos(valor) !== sugerido.total_centavos;
  const etiqueta = entregue ? null : etiquetaPreco(sugerido, quantidade);
  const travadoPago = Boolean(parcela?.pago_em);

  return (
    <form onSubmit={enviar} className="form" noValidate>
      <Campo rotulo="Modelo da placa" nome="servicos" erros={erros}>
        <select value={modeloId} disabled={entregue} onChange={(e) => setModeloId(e.target.value)}>
          <option value="">Selecione…</option>
          {apenasAtivos(modelos ?? [], modeloId).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Quantidade" nome="quantidade" erros={erros} type="number" min="1" disabled={entregue}
        value={quantidadeTexto} onChange={(e) => setQuantidadeTexto(e.target.value)} />
      <Campo rotulo="Valor total" nome="valor" erros={erros} inputMode="decimal" disabled={entregue || travadoPago}
        value={valor} onChange={(e) => { setValor(e.target.value); setManual(true); }} />
      {sugeridoDiferente && !entregue && (
        <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => { setManual(false); setValor(centavosParaTexto(sugerido.total_centavos)); }}>
          {`usar preço sugerido (${formatarDinheiro(sugerido.total_centavos)})`}
        </button>
      )}
      {etiqueta && <p className="campos-servicos__etiqueta">{etiqueta}</p>}
      {entregue && <p className="vazio">Venda já entregue: modelo, quantidade e valor não mudam mais.</p>}
      <Campo rotulo="Vencimento" nome="vencimento" erros={erros} type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
      <fieldset className="campo">
        <legend>QR codes</legend>
        {cliente.qrcodes.length ? cliente.qrcodes.map((q) => (
          <label key={q.id} style={{ display: 'block' }}>
            <input type="checkbox" checked={qrcodes.includes(q.id)} onChange={(e) => alternarQr(q.id, e.target.checked)} />{` #${q.id} ${q.nome}`}
          </label>
        )) : <p className="vazio">Este cliente ainda não tem QR codes.</p>}
      </fieldset>
      <Campo rotulo="Observações" nome="notas" erros={erros}>
        <textarea rows={3} value={notas} onChange={(e) => setNotas(e.target.value)} />
      </Campo>
      <Aviso erro={erro} />
      <div><button className="btn btn--primario" disabled={enviando}>Salvar</button></div>
    </form>
  );
}
```

Atenção ao rótulo do checkbox: o texto é `" #5 Mesa"`; `getByLabelText('#5 Mesa')` casa porque o Testing Library normaliza espaços nas pontas. Se `apenasAtivos` não aceitar `modelos` vazio + id atual, conferir a assinatura em `web/src/lib/ativos.js` (`apenasAtivos(lista, idAtual)`).

Run: `npx vitest run web/src/components/FormVendaPlacas.test.jsx` → PASS.

- [ ] **Step 3: Testes da aba que falham**

`web/src/pages/cliente/AbaPlacas.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClienteDetalhe } from '../ClienteDetalhe.jsx';
import { mockApi } from '../../test/mockApi.js';
import { renderizar } from '../../test/renderizar.jsx';
import { rotasPerfil } from '../../test/perfilCliente.js';

const venda = {
  id: 8, titulo: 'Placas NFC', etapa: 'andamento', servico: 'placas_nfc', valor_total_centavos: 25000, notas: null, atualizado_em: 'T',
  mensalidade_ativa: 0, qrcodes: [{ id: 5, nome: 'QR balcão' }],
  servicos: [{ tipo: 'placas_nfc', modelo_id: 2, modelo_nome: 'Placa 10x15', quantidade: 3, valor_total_centavos: 25000, venda_id: null }],
};
const abrir = () => renderizar(<ClienteDetalhe />, { rota: '/clientes/1?aba=placas', padrao: '/clientes/:id' });

describe('Aba Placas NFC', () => {
  it('mostra resumo, cartão da venda, histórico avulso e QR codes com #id', async () => {
    mockApi(rotasPerfil({
      'GET /projetos?cliente_id=1': [venda],
      'GET /projetos/8/parcelas': { parcelas: [{ id: 40, valor_centavos: 25000, vencimento: '2026-10-05', pago_em: null, mensalidade: 0 }], resumo: {} },
      'GET /clientes/1/placas': { ja_comprou: 7, vendas_avulsas: [{ id: 2, modelo_nome: 'Placa 10x10', quantidade: 2, preco_vendido_centavos: 8000, data_venda: '2026-08-01' }] },
    }));
    abrir();
    expect(await screen.findByText('Já comprou 7 placas')).toBeInTheDocument();
    const cartao = screen.getByText('Placa 10x15 × 3').closest('li');
    expect(within(cartao).getByText('Pendente')).toBeInTheDocument();
    expect(within(cartao).getByText('#5')).toBeInTheDocument();
    expect(within(cartao).getByText(/a receber \(vence 05\/10\/2026\)/)).toBeInTheDocument();
    expect(screen.getByText(/Placa 10x10 × 2/)).toBeInTheDocument();
    expect(screen.getByText('01/08/2026')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'QR balcão' })).toHaveAttribute('href', '/qrcodes/5');
  });

  it('marcar entregue envia a etapa', async () => {
    const { chamadas } = mockApi(rotasPerfil({
      'GET /projetos?cliente_id=1': [venda],
      'GET /projetos/8/parcelas': { parcelas: [], resumo: {} },
      'PUT /projetos/8': { ...venda, etapa: 'entregue' },
    }));
    abrir();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Marcar entregue' }));
    expect(chamadas.find((c) => c.metodo === 'PUT').corpo).toEqual({ etapa: 'entregue' });
  });
});
```

Run: `npx vitest run web/src/pages/cliente/AbaPlacas.test.jsx` → FAIL.

- [ ] **Step 4: Implementar a aba**

`web/src/pages/cliente/AbaPlacas.jsx`:

```jsx
import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { useParcelas, parcelaUnica } from '../../hooks/useParcelas.js';
import { Aviso } from '../../components/Aviso.jsx';
import { Modal } from '../../components/Modal.jsx';
import { FormVendaPlacas } from '../../components/FormVendaPlacas.jsx';
import { formatarDinheiro } from '../../lib/dinheiro.js';
import { formatarData } from '../../lib/datas.js';
import { CobrancaServico } from './CobrancaServico.jsx';

function CartaoVenda({ cliente, projeto, onMudou }) {
  const { parcelas, recarregar } = useParcelas(projeto);
  const [editando, setEditando] = useState(false);
  const envio = useEnvio();
  const linha = projeto.servicos.find((s) => s.tipo === 'placas_nfc');

  function marcarEntregue() {
    envio.executar(async () => {
      await api(`/projetos/${projeto.id}`, { method: 'PUT', body: { etapa: 'entregue' } });
      onMudou();
    });
  }

  function excluir() {
    const aviso = linha?.venda_id
      ? 'Excluir esta venda de placas? A venda continua em Placas › Vendas; para devolver o estoque, exclua-a por lá.'
      : 'Excluir esta venda de placas?';
    if (!window.confirm(aviso)) return;
    envio.executar(async () => {
      await api(`/projetos/${projeto.id}`, { method: 'DELETE' });
      onMudou();
    });
  }

  async function salvar(corpo) {
    await api(`/projetos/${projeto.id}`, { method: 'PUT', body: corpo });
    setEditando(false);
    onMudou();
  }

  return (
    <li className="cartao" style={{ display: 'block' }}>
      <p><strong>{`${linha?.modelo_nome ?? '—'} × ${linha?.quantidade ?? 0}`}</strong></p>
      <p><CobrancaServico projeto={projeto} parcelas={parcelas} onPago={() => { recarregar(); onMudou(); }} /></p>
      <p>
        {projeto.etapa === 'entregue'
          ? <span className="etiqueta etiqueta--entregue">Entregue</span>
          : <>
              <span className="etiqueta etiqueta--andamento">Pendente</span>{' '}
              <button type="button" className="btn btn--fantasma btn--pequeno" onClick={marcarEntregue}>Marcar entregue</button>
            </>}
      </p>
      {projeto.qrcodes.length > 0 && (
        <p>QR: {projeto.qrcodes.map((q) => <span key={q.id} title={q.nome}>{`#${q.id}`} </span>)}</p>
      )}
      {projeto.notas && <p className="vazio">{projeto.notas}</p>}
      <p>
        <button type="button" className="btn" onClick={() => setEditando(true)}>Editar</button>{' '}
        <button type="button" className="btn btn--perigo" onClick={excluir}>Excluir</button>
      </p>
      <Aviso erro={envio.erro} />
      {editando && (
        <Modal titulo="Editar venda de placas" onFechar={() => setEditando(false)}>
          <FormVendaPlacas cliente={cliente} projeto={projeto} parcela={parcelaUnica(parcelas)} onSalvar={salvar} />
        </Modal>
      )}
    </li>
  );
}

export function AbaPlacas({ cliente, projetos, onMudou }) {
  // A lista é um array novo a cada render; a dependência precisa ser uma string estável.
  const versaoVendas = projetos.map((p) => `${p.id}:${p.atualizado_em}`).join(',');
  const { dados: resumo, recarregar } = useCarregar(() => api(`/clientes/${cliente.id}/placas`), [cliente.id, versaoVendas]);
  const [criando, setCriando] = useState(false);

  async function criar(corpo) {
    await api('/projetos', { method: 'POST', body: corpo });
    setCriando(false);
    onMudou();
    recarregar();
  }

  return (
    <div>
      <div className="pagina__topo">
        <h2>Placas NFC</h2>
        <button type="button" className="btn btn--primario" onClick={() => setCriando(true)}>+ Venda de placas</button>
      </div>
      {resumo && <p>{`Já comprou ${resumo.ja_comprou} ${resumo.ja_comprou === 1 ? 'placa' : 'placas'}`}</p>}
      {projetos.length ? (
        <ul className="lista">
          {projetos.map((p) => <CartaoVenda key={p.id} cliente={cliente} projeto={p} onMudou={onMudou} />)}
        </ul>
      ) : <p className="vazio">Nenhuma venda de placas pelo perfil ainda.</p>}

      {resumo?.vendas_avulsas.length > 0 && (
        <section className="cartao">
          <h3>Vendas avulsas</h3>
          <table className="tabela">
            <tbody>
              {resumo.vendas_avulsas.map((v) => (
                <tr key={v.id}>
                  <td>{`${v.modelo_nome} × ${v.quantidade}`}</td>
                  <td className="num">{formatarDinheiro(v.preco_vendido_centavos * v.quantidade)}</td>
                  <td>{formatarData(v.data_venda)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="cartao">
        <h3>QR Codes do cliente</h3>
        {cliente.qrcodes.length ? (
          <ul className="lista">
            {cliente.qrcodes.map((q) => (
              <li key={q.id}><span className="vazio">{`#${q.id}`}</span><Link to={`/qrcodes/${q.id}`}>{q.nome}</Link></li>
            ))}
          </ul>
        ) : <p className="vazio">Nenhum QR ainda.</p>}
      </section>

      {criando && (
        <Modal titulo="Nova venda de placas" onFechar={() => setCriando(false)}>
          <FormVendaPlacas cliente={cliente} onSalvar={criar} />
        </Modal>
      )}
    </div>
  );
}
```

Em `web/src/pages/ClienteDetalhe.jsx`: importar `AbaPlacas` de `./cliente/AbaPlacas.jsx` e trocar a linha da aba placas por
`{aba === 'placas' && <AbaPlacas cliente={cliente} projetos={doServico('placas_nfc')} onMudou={mudou} />}`.

Observação sobre o teste: no cartão a parte `#5` aparece num `<span>` com texto `"#5"` seguido de espaço — `getByText('#5')` casa com o texto normalizado. Na lista de QR do cliente, `#5` também aparece; por isso o teste usa `within(cartao)`.

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run --project web`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/hooks/usePrecoSugeridoPlacas.js web/src/components/FormVendaPlacas.jsx web/src/components/FormVendaPlacas.test.jsx web/src/pages/cliente/AbaPlacas.jsx web/src/pages/cliente/AbaPlacas.test.jsx web/src/pages/ClienteDetalhe.jsx
git commit -m "feat: aba Placas NFC no perfil com vendas, QRs e historico"
```

---

### Task 13: Número `#id` nos QR Codes

**Files:**
- Modify: `web/src/pages/QRCodes.jsx`, `web/src/pages/QRCodeDetalhe.jsx`
- Test: `web/src/pages/QRCodes.test.jsx`, `web/src/pages/QRCodeDetalhe.test.jsx`

- [ ] **Step 1: Testes que falham**

Em `web/src/pages/QRCodes.test.jsx`, no teste "lista os QR codes", depois de achar o link do primeiro QR, acrescentar uma verificação do número (usar o `id` da fixture do arquivo; ex. se o QR é `{ id: 1, nome: … }`):

```js
    expect(screen.getByText('#1')).toBeInTheDocument();
```

Em `web/src/pages/QRCodeDetalhe.test.jsx`, no teste "mostra os dados", acrescentar (com o `id` da fixture):

```js
    expect(screen.getByText('#1')).toBeInTheDocument();
```

Run: `npx vitest run web/src/pages/QRCodes.test.jsx web/src/pages/QRCodeDetalhe.test.jsx` → FAIL.

- [ ] **Step 2: Implementar**

`web/src/pages/QRCodes.jsx` — a célula do nome passa a ser:

```jsx
                <td><span className="vazio">{`#${q.id}`}</span> <Link to={`/qrcodes/${q.id}`}>{q.nome}</Link></td>
```

`web/src/pages/QRCodeDetalhe.jsx` — logo depois de `<h1>{qrcode.nome}</h1>`:

```jsx
          <p className="vazio">{`#${qrcode.id}`}</p>
```

- [ ] **Step 3: Rodar e ver passar**

Run: `npx vitest run web/src/pages/QRCodes.test.jsx web/src/pages/QRCodeDetalhe.test.jsx` → PASS.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/QRCodes.jsx web/src/pages/QRCodeDetalhe.jsx web/src/pages/QRCodes.test.jsx web/src/pages/QRCodeDetalhe.test.jsx
git commit -m "feat: mostra o numero do QR code na lista e no detalhe"
```

---

### Task 14: Financeiro com coluna e filtro de serviço

**Files:**
- Modify: `web/src/pages/Financeiro.jsx`
- Test: `web/src/pages/Financeiro.test.jsx`

**Interfaces:**
- Consumes: `servico` e `cliente_id` em `GET /parcelas` (Task 7); `ROTULO_SERVICO`, `ABA_DO_SERVICO` (Task 9).

- [ ] **Step 1: Teste que falha**

Em `web/src/pages/Financeiro.test.jsx`, acrescentar `servico: 'site_sistema', cliente_id: 1` à fixture `parcela` e um teste novo:

```js
  it('mostra o serviço, filtra por ele e leva GMN para o perfil do cliente', async () => {
    const parcelaGmn = { ...parcela, id: 2, projeto_id: 6, projeto_titulo: 'Google Meu Negócio', servico: 'google_meu_negocio' };
    const { chamadas } = mockApi({
      'GET /parcelas': [parcela, parcelaGmn],
      'GET /parcelas?servico=google_meu_negocio': [parcelaGmn],
      [`GET /financeiro/mensal?ano=${ano}`]: meses,
    });
    renderizar(<Financeiro />);
    expect(await screen.findByRole('link', { name: 'Google Meu Negócio' })).toHaveAttribute('href', '/clientes/1?aba=gmn');
    expect(screen.getByRole('link', { name: 'Site Ana' })).toHaveAttribute('href', '/projetos/5');
    expect(screen.getByRole('cell', { name: 'GMN' })).toBeInTheDocument();
    await userEvent.setup().selectOptions(screen.getByLabelText('Serviço'), 'google_meu_negocio');
    expect(chamadas.some((c) => c.caminho === '/parcelas?servico=google_meu_negocio')).toBe(true);
  });
```

Run: `npx vitest run web/src/pages/Financeiro.test.jsx` → FAIL.

- [ ] **Step 2: Implementar**

Em `web/src/pages/Financeiro.jsx`:
- import: `import { ROTULO_ESTADO_PARCELA, ROTULO_SERVICO, ABA_DO_SERVICO } from '../lib/rotulos.js';`
- estado: `const [servico, setServico] = useState('');` e `Object.entries({ estado, mes, servico })` na consulta;
- função antes do `return`:

```js
  const linkDoProjeto = (p) => (p.servico === 'site_sistema'
    ? `/projetos/${p.projeto_id}`
    : `/clientes/${p.cliente_id}?aba=${ABA_DO_SERVICO[p.servico]}`);
```

- novo filtro, depois do de mês:

```jsx
          <label className="campo">
            <span>Serviço</span>
            <select aria-label="Serviço" value={servico} onChange={(e) => setServico(e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(ROTULO_SERVICO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </select>
          </label>
```

- cabeçalho: `<tr><th>Vencimento</th><th>Serviço</th><th>Projeto</th><th>Cliente</th><th>Descrição</th><th>Estado</th><th className="num">Valor</th></tr>`;
- linha: depois da célula de vencimento, `<td>{ROTULO_SERVICO[p.servico]}</td>`; o link do projeto vira `<Link to={linkDoProjeto(p)}>{p.projeto_titulo}</Link>`;
- rodapé: `colSpan={6}`.

- [ ] **Step 3: Rodar e ver passar**

Run: `npx vitest run web/src/pages/Financeiro.test.jsx` → PASS.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/Financeiro.jsx web/src/pages/Financeiro.test.jsx
git commit -m "feat: financeiro com coluna e filtro por servico"
```

---

### Task 15: Card "Para entregar" no Início

**Files:**
- Modify: `web/src/pages/Inicio.jsx`
- Test: `web/src/pages/Inicio.test.jsx`

**Interfaces:**
- Consumes: `para_entregar` e `servico`/`cliente_id` nos itens de parcela (Task 8); `ABA_DO_SERVICO` (Task 9).

- [ ] **Step 1: Teste que falha**

Em `web/src/pages/Inicio.test.jsx`:

```js
  it('mostra o que falta entregar e leva parcela de GMN ao perfil', async () => {
    mockApi({
      'GET /painel': {
        cartoes: { a_receber_mes_centavos: 0, atrasadas: { quantidade: 0, total_centavos: 0 }, em_andamento: 0, propostas: { quantidade: 0, total_centavos: 0 } },
        tarefas_por_projeto: { reais: [], ficticios: [] },
        proximos: [{ tipo: 'parcela', id: 3, projeto_id: 6, titulo: 'Pagamento', contexto: 'Google Meu Negócio', data: '2026-09-25', atrasado: false, valor_centavos: 20000, servico: 'google_meu_negocio', cliente_id: 1 }],
        para_entregar: {
          gmn: 1, placas: 1,
          itens: [
            { projeto_id: 6, cliente_id: 1, cliente_nome: 'Ana', servico: 'google_meu_negocio' },
            { projeto_id: 8, cliente_id: 2, cliente_nome: 'Bruno', servico: 'placas_nfc' },
          ],
        },
      },
    });
    renderizar(<Inicio />);
    expect(await screen.findByText('1 GMN pendente · 1 venda de placas a entregar')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ana — Google Meu Negócio' })).toHaveAttribute('href', '/clientes/1?aba=gmn');
    expect(screen.getByRole('link', { name: 'Bruno — Placas NFC' })).toHaveAttribute('href', '/clientes/2?aba=placas');
    expect(screen.getByRole('link', { name: 'Pagamento' })).toHaveAttribute('href', '/clientes/1?aba=gmn');
  });
```

Run: `npx vitest run web/src/pages/Inicio.test.jsx` → FAIL.

- [ ] **Step 2: Implementar**

Em `web/src/pages/Inicio.jsx`:
- import `ABA_DO_SERVICO` de `../lib/rotulos.js`;
- trocar `destino` por:

```js
const ROTULO_ENTREGA = { google_meu_negocio: 'Google Meu Negócio', placas_nfc: 'Placas NFC' };
const paginaDoServico = (item) => `/clientes/${item.cliente_id}?aba=${ABA_DO_SERVICO[item.servico]}`;
function destino(item) {
  if (item.servico && item.servico !== 'site_sistema') return paginaDoServico(item);
  return item.projeto_id ? `/projetos/${item.projeto_id}` : '/conteudo';
}
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
```

- no `Inicio`, desestruturar também `para_entregar: paraEntregar = { gmn: 0, placas: 0, itens: [] }` de `dados`;
- depois do bloco `.cartoes` e antes de `.grade-2`:

```jsx
      <section className="cartao">
        <h2>Para entregar</h2>
        <p>{`${plural(paraEntregar.gmn, 'GMN pendente', 'GMN pendentes')} · ${plural(paraEntregar.placas, 'venda de placas a entregar', 'vendas de placas a entregar')}`}</p>
        {paraEntregar.itens.length > 0 && (
          <ul className="lista">
            {paraEntregar.itens.map((item) => (
              <li key={item.projeto_id}>
                <Link to={paginaDoServico(item)}>{`${item.cliente_nome} — ${ROTULO_ENTREGA[item.servico]}`}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
```

- [ ] **Step 3: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS (servidor e web).

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/Inicio.jsx web/src/pages/Inicio.test.jsx
git commit -m "feat: inicio mostra GMN e placas para entregar"
```

---

### Task 16: Verificação no app real

- [ ] **Step 1:** `pm2 restart crm-madia-api` (aplica a migration `015` no banco real).
- [ ] **Step 2:** Abrir o CRM e conferir: Funil e Projetos sem GMN/placas; perfil de um cliente com as três abas e `?aba=` funcionando; criar um GMN de teste (cobrança única), marcar pago e configurado, depois excluir; criar uma venda de placas de teste com QR ligado, conferir no Financeiro (coluna Serviço) e no Início ("Para entregar"), excluir. Não marcar a venda de teste como entregue (isso baixaria estoque real).
- [ ] **Step 3:** Se algo divergir, corrigir com teste antes; senão, nada a commitar.
