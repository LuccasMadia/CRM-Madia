# Código Pix copia-e-cola por cliente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cadastrar a chave Pix de cada cliente e gerar, a partir dela, o código Pix "copia e cola" (BR Code/EMV, sem valor fixo) exibido com botão de copiar na ficha do cliente.

**Architecture:** Função pura `gerarCodigoPix` em `server/domain/pix.js` (sem dependência nova) monta o payload EMV estático. Os 3 campos novos (`chave_pix`, `tipo_chave_pix`, `cidade`) entram no cadastro de cliente já existente; o código Pix é calculado on-the-fly no `GET /clientes/:id`, nunca armazenado. Frontend reaproveita os componentes `Campo`/`FormCliente` e `ClienteDetalhe` já existentes.

**Tech Stack:** Node.js (ESM, `node:sqlite`), Express, Vitest + Supertest (backend); React 19 + Vite + Vitest/Testing Library (frontend). Sem dependências novas.

## Global Constraints

- Node >= 24, módulos ESM (`"type": "module"`), sem build step no backend.
- Não adicionar nenhuma dependência npm nova — o BR Code é implementado na mão.
- Seguir os padrões já existentes: `criarRepo`/`CAMPOS_*` em `server/repos/`, `validar`/`REGRAS_*` em `server/routes/`, migrations SQL numeradas sequencialmente em `server/db/migrations/`.
- Testes com Vitest (`npm test`); backend usa `server/test/contexto.js` + Supertest; frontend usa Testing Library + `web/src/test/mockApi.js` e `web/src/test/renderizar.jsx`.
- Sem página pública, sem imagem de QR renderizada, sem rastreio de pagamento (fora de escopo da spec).

---

### Task 1: `server/domain/pix.js` — gerar o BR Code Pix

**Files:**
- Create: `server/domain/pix.js`
- Create: `server/domain/pix.test.js`

**Interfaces:**
- Produces: `export function gerarCodigoPix({ chave, nomeRecebedor, cidade }): string` — payload BR Code Pix completo (com CRC). `chave`, `nomeRecebedor`, `cidade` são strings não vazias.
- Produces (uso interno, mas exportado para teste direto do CRC): `export function crc16(payload: string): string` — retorna 4 caracteres hex maiúsculos.

- [ ] **Step 1: Escrever o teste do CRC16 (vetor de teste padrão da literatura)**

```js
// server/domain/pix.test.js
import { describe, it, expect } from 'vitest';
import { crc16, gerarCodigoPix } from './pix.js';

describe('crc16', () => {
  it('calcula CRC-16/CCITT-FALSE (vetor de teste padrão: "123456789" → 0x29B1)', () => {
    expect(crc16('123456789')).toBe('29B1');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run server/domain/pix.test.js`
Expected: FAIL — `pix.js` não existe (`Cannot find module './pix.js'` ou erro de import).

- [ ] **Step 3: Implementar `crc16` e os helpers de TLV/sanitização (mínimo pra passar o Step 1)**

```js
// server/domain/pix.js
function campoTlv(id, valor) {
  return `${id}${String(valor.length).padStart(2, '0')}${valor}`;
}

function removerAcentos(texto) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function sanitizar(texto, tamanhoMax) {
  return removerAcentos(texto)
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .trim()
    .slice(0, tamanhoMax);
}

export function crc16(payload) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run server/domain/pix.test.js`
Expected: PASS (1 teste).

- [ ] **Step 5: Escrever o teste de `gerarCodigoPix` (estrutura + autoconsistência do CRC)**

```js
// adicionar em server/domain/pix.test.js
describe('gerarCodigoPix', () => {
  it('monta o payload com GUI do Pix, a chave e CRC final consistente', () => {
    const codigo = gerarCodigoPix({ chave: 'popy@email.com', nomeRecebedor: 'Popy', cidade: 'Sao Paulo' });
    expect(codigo.startsWith('000201')).toBe(true);
    expect(codigo).toContain('br.gov.bcb.pix');
    expect(codigo).toContain('popy@email.com');
    const semCrc = codigo.slice(0, -4);
    const crcInformado = codigo.slice(-4);
    expect(crcInformado).toBe(crc16(semCrc));
  });

  it('não inclui campo de valor (54) — valor livre', () => {
    const codigo = gerarCodigoPix({ chave: 'popy@email.com', nomeRecebedor: 'Popy', cidade: 'Sao Paulo' });
    expect(codigo).not.toMatch(/5405\d/); // campo 54 "valor" nunca aparece
  });

  it('remove acentos, maiusculiza e corta nome/cidade nos limites do BR Code', () => {
    const codigo = gerarCodigoPix({
      chave: 'popy@email.com',
      nomeRecebedor: 'Pousada Açaí e Café Com Leite Gelado',
      cidade: 'São José dos Campos',
    });
    expect(codigo).toContain('POUSADA ACAI E CAFE COM LEI'.slice(0, 25));
    expect(codigo).toContain('SAO JOSE DOS C'.slice(0, 15));
    expect(codigo).not.toMatch(/[çãéÇÃÉ]/i);
  });
});
```

- [ ] **Step 6: Rodar e confirmar que falham (função ainda não existe)**

Run: `npx vitest run server/domain/pix.test.js`
Expected: FAIL — `gerarCodigoPix is not a function` ou similar nos 3 novos testes; o teste do `crc16` continua passando.

- [ ] **Step 7: Implementar `gerarCodigoPix`**

```js
// adicionar em server/domain/pix.js
export function gerarCodigoPix({ chave, nomeRecebedor, cidade }) {
  const merchantAccountInfo = campoTlv('26', campoTlv('00', 'br.gov.bcb.pix') + campoTlv('01', chave.trim()));
  const additionalData = campoTlv('62', campoTlv('05', '***'));
  const semCrc =
    campoTlv('00', '01') +
    campoTlv('01', '11') +
    merchantAccountInfo +
    campoTlv('52', '0000') +
    campoTlv('53', '986') +
    campoTlv('58', 'BR') +
    campoTlv('59', sanitizar(nomeRecebedor, 25)) +
    campoTlv('60', sanitizar(cidade, 15)) +
    additionalData +
    '6304';
  return semCrc + crc16(semCrc);
}
```

- [ ] **Step 8: Rodar todos os testes do arquivo e confirmar que passam**

Run: `npx vitest run server/domain/pix.test.js`
Expected: PASS (4 testes).

- [ ] **Step 9: Commit**

```bash
git add server/domain/pix.js server/domain/pix.test.js
git commit -m "feat: gerar BR Code Pix (copia-e-cola) sem valor fixo"
```

---

### Task 2: Backend — campos de Pix no cliente + código no `GET /clientes/:id`

**Files:**
- Create: `server/db/migrations/011_clientes_pix.sql`
- Modify: `server/repos/clientes.js`
- Modify: `server/routes/clientes.js`
- Modify: `server/routes/clientes.test.js`

**Interfaces:**
- Consumes: `gerarCodigoPix({ chave, nomeRecebedor, cidade })` de `../domain/pix.js` (Task 1).
- Produces: cliente agora pode ter `chave_pix: string|null`, `tipo_chave_pix: 'cpf'|'cnpj'|'email'|'telefone'|'aleatoria'|null`, `cidade: string|null` persistidos; `GET /clientes/:id` inclui `pix_copia_cola: string|null` no corpo da resposta (consumido pelo frontend na Task 4).

- [ ] **Step 1: Escrever os testes de rota (ainda devem falhar)**

```js
// adicionar em server/routes/clientes.test.js, dentro do describe('/api/clientes', ...)
it('gera pix_copia_cola quando a chave Pix está completa', async () => {
  const cliente = await criarCliente({
    nome: 'Ana Souza',
    empresa: 'Doces da Ana',
    chave_pix: 'ana@doces.com',
    tipo_chave_pix: 'email',
    cidade: 'Sao Paulo',
  });
  const res = await ctx.http.get(`/api/clientes/${cliente.id}`).expect(200);
  expect(res.body.pix_copia_cola).toContain('ana@doces.com');
});

it('pix_copia_cola é null quando o cliente não tem chave Pix', async () => {
  const cliente = await criarCliente();
  const res = await ctx.http.get(`/api/clientes/${cliente.id}`).expect(200);
  expect(res.body.pix_copia_cola).toBeNull();
});

it('exige tipo e cidade quando a chave Pix é informada', async () => {
  const res = await ctx.http
    .post('/api/clientes')
    .send({ nome: 'Bia', chave_pix: 'bia@x.com' })
    .expect(400);
  expect(res.body.erros).toEqual([{ campo: 'chave_pix', mensagem: 'Informe tipo de chave e cidade' }]);
});

it('exige cidade ao completar a chave Pix via atualização parcial', async () => {
  const cliente = await criarCliente();
  const res = await ctx.http
    .put(`/api/clientes/${cliente.id}`)
    .send({ chave_pix: 'bia@x.com', tipo_chave_pix: 'email' })
    .expect(400);
  expect(res.body.erros).toEqual([{ campo: 'chave_pix', mensagem: 'Informe tipo de chave e cidade' }]);
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npx vitest run server/routes/clientes.test.js`
Expected: FAIL nos 4 testes novos — `chave_pix`/`tipo_chave_pix`/`cidade` ainda não existem como colunas/regras, `pix_copia_cola` não existe na resposta.

- [ ] **Step 3: Criar a migration**

```sql
-- server/db/migrations/011_clientes_pix.sql
ALTER TABLE clientes ADD COLUMN chave_pix TEXT;
ALTER TABLE clientes ADD COLUMN tipo_chave_pix TEXT CHECK (tipo_chave_pix IN ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria'));
ALTER TABLE clientes ADD COLUMN cidade TEXT;
```

- [ ] **Step 4: Adicionar os campos ao repo**

```js
// server/repos/clientes.js — trocar a linha de CAMPOS_CLIENTE
export const CAMPOS_CLIENTE = ['nome', 'empresa', 'email', 'telefone', 'instagram', 'origem', 'notas', 'chave_pix', 'tipo_chave_pix', 'cidade'];
```

- [ ] **Step 5: Atualizar `REGRAS_CLIENTE`, adicionar `exigirPixCompleto`, importar `gerarCodigoPix`, e usar os dois no handler**

```js
// server/routes/clientes.js — topo do arquivo
import { gerarCodigoPix } from '../domain/pix.js';

// REGRAS_CLIENTE ganha 3 linhas:
export const REGRAS_CLIENTE = {
  nome: { tipo: 'texto', obrigatorio: true },
  empresa: { tipo: 'texto' },
  email: { tipo: 'texto' },
  telefone: { tipo: 'texto' },
  instagram: { tipo: 'texto' },
  origem: { tipo: 'texto' },
  notas: { tipo: 'texto' },
  chave_pix: { tipo: 'texto' },
  tipo_chave_pix: { tipo: 'enum', valores: ['cpf', 'cnpj', 'email', 'telefone', 'aleatoria'] },
  cidade: { tipo: 'texto' },
};

// nova função, antes de rotasClientes ou dentro dela (ao lado de onde REGRAS_CLIENTE é usado)
function exigirPixCompleto(dados, atual = {}) {
  const chave = dados.chave_pix !== undefined ? dados.chave_pix : atual.chave_pix;
  const tipo = dados.tipo_chave_pix !== undefined ? dados.tipo_chave_pix : atual.tipo_chave_pix;
  const cidade = dados.cidade !== undefined ? dados.cidade : atual.cidade;
  if (chave && (!tipo || !cidade)) {
    throw new ErroValidacao([{ campo: 'chave_pix', mensagem: 'Informe tipo de chave e cidade' }]);
  }
}
```

Essa função usa `ErroValidacao`, já importado no topo do arquivo (`import { ErroHttp, naoEncontrado } from '../http/erros.js';` precisa virar `import { ErroHttp, ErroValidacao, naoEncontrado } from '../http/erros.js';`).

- [ ] **Step 6: Chamar `exigirPixCompleto` no `POST /` e no `PUT /:id`, e incluir `pix_copia_cola` no `GET /:id`**

```js
// server/routes/clientes.js

r.post('/', (req, res) => {
  const dados = validar(req.body, REGRAS_CLIENTE);
  exigirPixCompleto(dados);
  res.status(201).json(clientes.criar(dados));
});

r.get('/:id', (req, res) => {
  const cliente = clientes.obter(lerId(req.params.id));
  if (!cliente) throw naoEncontrado('Cliente');
  res.json({
    ...cliente,
    projetos: projetos.listarComCliente({ cliente_id: cliente.id }),
    qrcodes: qrcodes.listar({ cliente_id: cliente.id }),
    total_faturado_centavos: clientes.totalFaturado(cliente.id),
    pix_copia_cola: cliente.chave_pix
      ? gerarCodigoPix({ chave: cliente.chave_pix, nomeRecebedor: cliente.empresa || cliente.nome, cidade: cliente.cidade })
      : null,
  });
});

r.put('/:id', (req, res) => {
  const id = lerId(req.params.id);
  const atual = clientes.obter(id);
  if (!atual) throw naoEncontrado('Cliente');
  const dados = validar(req.body, REGRAS_CLIENTE, { parcial: true });
  exigirPixCompleto(dados, atual);
  res.json(clientes.atualizar(id, dados));
});
```

- [ ] **Step 7: Rodar os testes de clientes e confirmar que passam**

Run: `npx vitest run server/routes/clientes.test.js`
Expected: PASS em todos os testes do arquivo (os 4 novos + os já existentes).

- [ ] **Step 8: Rodar a suíte completa pra garantir que nada mais quebrou**

Run: `npm test`
Expected: PASS em todos os arquivos (nenhum outro módulo depende da forma anterior de `CAMPOS_CLIENTE`/`REGRAS_CLIENTE`).

- [ ] **Step 9: Commit**

```bash
git add server/db/migrations/011_clientes_pix.sql server/repos/clientes.js server/routes/clientes.js server/routes/clientes.test.js
git commit -m "feat: campos de chave Pix no cliente e pix_copia_cola no GET"
```

---

### Task 3: Frontend — campos de chave Pix no formulário do cliente

**Files:**
- Modify: `web/src/lib/rotulos.js`
- Modify: `web/src/components/FormCliente.jsx`

**Interfaces:**
- Consumes: nenhuma interface de outra task (campos puramente de apresentação/formulário).
- Produces: `TIPOS_CHAVE_PIX: string[]` e `ROTULO_TIPO_CHAVE_PIX: Record<string,string>` exportados de `web/src/lib/rotulos.js`, usados por `FormCliente.jsx` e pela Task 4 se necessário.

Não há teste automatizado dedicado pra `FormCliente.jsx` (não existe hoje `FormCliente.test.jsx` — o componente é exercitado indiretamente pelas páginas que o usam). Esta task não introduz um arquivo de teste novo; a verificação é via `npm test` (garantir que nada quebrou) e checagem manual dos tipos/strings.

- [ ] **Step 1: Adicionar os rótulos de tipo de chave Pix**

```js
// adicionar ao final de web/src/lib/rotulos.js
export const ROTULO_TIPO_CHAVE_PIX = { cpf: 'CPF', cnpj: 'CNPJ', email: 'E-mail', telefone: 'Telefone', aleatoria: 'Aleatória' };
export const TIPOS_CHAVE_PIX = Object.keys(ROTULO_TIPO_CHAVE_PIX);
```

- [ ] **Step 2: Adicionar os 3 campos ao formulário**

```jsx
// web/src/components/FormCliente.jsx — arquivo completo
import { useFormulario } from '../hooks/useFormulario.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Campo } from './Campo.jsx';
import { Aviso } from './Aviso.jsx';
import { TIPOS_CHAVE_PIX, ROTULO_TIPO_CHAVE_PIX } from '../lib/rotulos.js';

const VAZIO = {
  nome: '', empresa: '', email: '', telefone: '', instagram: '', origem: '', notas: '',
  tipo_chave_pix: '', chave_pix: '', cidade: '',
};
const ORIGENS = ['Indicação', 'Instagram', 'Site', 'Outro'];

export function FormCliente({ inicial = {}, rotuloBotao = 'Salvar', onSalvar }) {
  const { valores, campo } = useFormulario(
    Object.fromEntries(Object.keys(VAZIO).map((k) => [k, inicial[k] ?? ''])),
  );
  const { erros, erro, enviando, executar } = useEnvio();

  function enviar(e) {
    e.preventDefault();
    executar(() => onSalvar(valores));
  }

  return (
    <form onSubmit={enviar} className="form" noValidate>
      <Campo rotulo="Nome" nome="nome" erros={erros} {...campo('nome')} />
      <Campo rotulo="Empresa" nome="empresa" erros={erros} {...campo('empresa')} />
      <Campo rotulo="Email" nome="email" erros={erros} type="email" {...campo('email')} />
      <Campo rotulo="Telefone / WhatsApp" nome="telefone" erros={erros} {...campo('telefone')} />
      <Campo rotulo="Instagram" nome="instagram" erros={erros} {...campo('instagram')} />
      <Campo rotulo="Origem" nome="origem" erros={erros} list="origens" {...campo('origem')} />
      <datalist id="origens">{ORIGENS.map((o) => <option key={o} value={o} />)}</datalist>
      <Campo rotulo="Notas" nome="notas" erros={erros}>
        <textarea rows={4} {...campo('notas')} />
      </Campo>
      <Campo rotulo="Tipo de chave Pix" nome="tipo_chave_pix" erros={erros}>
        <select {...campo('tipo_chave_pix')}>
          <option value="">Selecione…</option>
          {TIPOS_CHAVE_PIX.map((t) => <option key={t} value={t}>{ROTULO_TIPO_CHAVE_PIX[t]}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Chave Pix" nome="chave_pix" erros={erros} {...campo('chave_pix')} />
      <Campo rotulo="Cidade" nome="cidade" erros={erros} {...campo('cidade')} />
      <Aviso erro={erro} />
      <div><button className="btn btn--primario" disabled={enviando}>{rotuloBotao}</button></div>
    </form>
  );
}
```

- [ ] **Step 3: Rodar a suíte do frontend e confirmar que nada quebrou**

Run: `npx vitest run web/src`
Expected: PASS em todos os arquivos (nenhum teste existente depende do formato exato de `VAZIO` em `FormCliente.jsx`).

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/rotulos.js web/src/components/FormCliente.jsx
git commit -m "feat: campos de chave Pix no formulário do cliente"
```

---

### Task 4: Frontend — cartão "Pix" com botão copiar na ficha do cliente

**Files:**
- Modify: `web/src/pages/ClienteDetalhe.jsx`
- Modify: `web/src/pages/ClienteDetalhe.test.jsx`

**Interfaces:**
- Consumes: `cliente.pix_copia_cola: string|null` (produzido pela Task 2 no `GET /clientes/:id`).
- Produces: nada consumido por outras tasks (ponta final da feature).

- [ ] **Step 1: Escrever os testes do cartão Pix**

```jsx
// adicionar em web/src/pages/ClienteDetalhe.test.jsx, dentro do describe('ClienteDetalhe', ...)
it('mostra o código Pix e copia ao clicar no botão', async () => {
  const escreverNaAreaDeTransferencia = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText: escreverNaAreaDeTransferencia } });
  mockApi({ 'GET /clientes/1': { ...cliente, pix_copia_cola: '00020126...CODIGO...6304ABCD' } });
  renderizar(<ClienteDetalhe />, { rota: '/clientes/1', padrao: '/clientes/:id' });

  expect(await screen.findByText('00020126...CODIGO...6304ABCD')).toBeInTheDocument();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Copiar' }));
  expect(escreverNaAreaDeTransferencia).toHaveBeenCalledWith('00020126...CODIGO...6304ABCD');
  expect(await screen.findByRole('button', { name: 'Copiado!' })).toBeInTheDocument();
});

it('mostra aviso quando o cliente não tem chave Pix cadastrada', async () => {
  mockApi({ 'GET /clientes/1': { ...cliente, pix_copia_cola: null } });
  renderizar(<ClienteDetalhe />, { rota: '/clientes/1', padrao: '/clientes/:id' });
  expect(await screen.findByText('Preencha a chave Pix no formulário para gerar o código.')).toBeInTheDocument();
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npx vitest run web/src/pages/ClienteDetalhe.test.jsx`
Expected: FAIL nos 2 testes novos — não existe cartão "Pix" nem botão "Copiar" ainda.

- [ ] **Step 3: Implementar o cartão Pix**

```jsx
// web/src/pages/ClienteDetalhe.jsx — arquivo completo
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Aviso } from '../components/Aviso.jsx';
import { FormCliente } from '../components/FormCliente.jsx';
import { formatarDinheiro } from '../lib/dinheiro.js';
import { ROTULO_ETAPA } from '../lib/rotulos.js';

function CartaoPix({ codigo }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    await navigator.clipboard.writeText(codigo);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  if (!codigo) return <p className="vazio">Preencha a chave Pix no formulário para gerar o código.</p>;
  return (
    <>
      <textarea readOnly rows={4} value={codigo} />
      <div><button type="button" className="btn" onClick={copiar}>{copiado ? 'Copiado!' : 'Copiar'}</button></div>
    </>
  );
}

export function ClienteDetalhe() {
  const { id } = useParams();
  const navegar = useNavigate();
  const { dados: cliente, erro, recarregar } = useCarregar(() => api(`/clientes/${id}`), [id]);
  const exclusao = useEnvio();

  if (erro) return <Aviso erro={erro} />;
  if (!cliente) return <p>Carregando…</p>;

  async function salvar(dados) {
    await api(`/clientes/${id}`, { method: 'PUT', body: dados });
    recarregar();
  }

  function excluir() {
    if (!window.confirm(`Excluir o cliente ${cliente.nome}?`)) return;
    exclusao.executar(async () => {
      await api(`/clientes/${id}`, { method: 'DELETE' });
      navegar('/clientes');
    });
  }

  return (
    <section>
      <header className="pagina__topo">
        <div>
          <p className="sobretitulo"><Link to="/clientes">Clientes</Link></p>
          <h1>{cliente.nome}</h1>
        </div>
        <button type="button" className="btn btn--perigo" onClick={excluir}>Excluir</button>
      </header>
      <Aviso erro={exclusao.erro} />
      <div className="grade-2">
        <div className="cartao">
          <h2>Dados</h2>
          <FormCliente key={cliente.atualizado_em} inicial={cliente} onSalvar={salvar} />
        </div>
        <div className="cartao">
          <h2>Projetos</h2>
          <p>Total faturado: <strong>{formatarDinheiro(cliente.total_faturado_centavos)}</strong></p>
          {cliente.projetos.length ? (
            <ul className="lista">
              {cliente.projetos.map((p) => (
                <li key={p.id}>
                  <Link to={`/projetos/${p.id}`}>{p.titulo}</Link>
                  <span className={`etiqueta etiqueta--${p.etapa}`}>{ROTULO_ETAPA[p.etapa]}</span>
                </li>
              ))}
            </ul>
          ) : <p className="vazio">Nenhum projeto ainda. Crie uma oportunidade no Funil.</p>}
        </div>
        <div className="cartao">
          <h2>QR Codes</h2>
          {cliente.qrcodes.length ? (
            <ul className="lista">
              {cliente.qrcodes.map((q) => (
                <li key={q.id}><Link to={`/qrcodes/${q.id}`}>{q.nome}</Link></li>
              ))}
            </ul>
          ) : <p className="vazio">Nenhum QR ainda.</p>}
        </div>
        <div className="cartao">
          <h2>Pix</h2>
          <CartaoPix codigo={cliente.pix_copia_cola} />
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `npx vitest run web/src/pages/ClienteDetalhe.test.jsx`
Expected: PASS em todos os testes do arquivo.

- [ ] **Step 5: Rodar a suíte completa do projeto**

Run: `npm test`
Expected: PASS em tudo (backend + frontend).

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/ClienteDetalhe.jsx web/src/pages/ClienteDetalhe.test.jsx
git commit -m "feat: cartão Pix com botão copiar na ficha do cliente"
```
