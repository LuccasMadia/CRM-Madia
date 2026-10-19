# Guia: CRM em crm.luccasmadia.com.br + token do Instagram para publicar

Passos feitos à mão, uma vez só. Nada aqui precisa ser colado no chat — senhas, códigos e tokens ficam só com você.

> **Ordem:** as partes 1 e 2 podem ser feitas já. As partes 3 e 4 só funcionam de verdade depois que o CRM for atualizado (tarefas 1 e 2 do plano) — antes disso o endereço abre com erro, e tudo bem.

---

## Parte 1 — Domínio no Cloudflare (o portfólio continua igual)

1. Crie a conta em **dash.cloudflare.com/sign-up** (plano Free).
2. **Add a domain** → `luccasmadia.com.br` → plano **Free**.
3. Confira os registros que o Cloudflare encontrou. Precisam existir estes dois (adicione em **Add record** se faltar):

   | Tipo | Nome | Conteúdo | Proxy |
   |---|---|---|---|
   | A | `@` | `216.198.79.1` | **DNS only** (nuvem cinza) |
   | CNAME | `www` | `cname.vercel-dns.com` | **DNS only** (nuvem cinza) |

4. Anote os **dois nameservers** que o Cloudflare mostrar (ex.: `algo.ns.cloudflare.com`).
5. **Pare aqui e mande para o Claude** um print dos registros + os dois nameservers, para conferir antes da troca.

## Parte 2 — Trocar os nameservers no Registro.br

1. Entre em **registro.br** → seu domínio `luccasmadia.com.br` → **Alterar servidores DNS**.
2. Troque pelos dois nameservers do Cloudflare.
3. Se aparecer aviso sobre **DNSSEC**, aceite **desativar** (se ficar ativo, o domínio inteiro pode sair do ar).
4. Salve. A troca leva de minutos a algumas horas. O Cloudflare manda e-mail quando o domínio estiver ativo.
5. Depois de ativo, abra `luccasmadia.com.br` e `www.luccasmadia.com.br` e confira que o portfólio abre normal.

## Parte 3 — Túnel até o CRM (depois da atualização do CRM)

1. No painel do Cloudflare, abra **Zero Trust** (na primeira vez ele pede um nome de equipe e o plano **Free** — pode pedir cartão só para confirmar, não cobra no Free).
2. **Networks → Tunnels → Create a tunnel** → tipo **Cloudflared** → nome `crm-madia`.
3. Escolha **Windows**. Ele mostra um comando parecido com `cloudflared.exe service install <código>`. Baixe o `cloudflared` pelo link da própria tela, abra o **PowerShell como administrador** e rode o comando. Isso instala o túnel como serviço: ele sobe sozinho quando o PC liga.
4. Na etapa **Public Hostname**:
   - Subdomain: `crm`
   - Domain: `luccasmadia.com.br`
   - Service: **HTTP** → `127.0.0.1:5174`
5. Salve. O túnel deve aparecer como **Healthy**.

## Parte 4 — Login na frente do CRM (obrigatório antes de usar)

**Sem esta parte, qualquer pessoa com o link vê o CRM.** Faça logo depois da parte 3.

1. Em **Zero Trust → Access → Applications → Add an application → Self-hosted**.
2. Nome `CRM Madia`, domínio `crm.luccasmadia.com.br` (caminho vazio), **Session duration: 1 month**.
3. Política: nome `So eu`, ação **Allow**, regra **Include → Emails →** `luccasmadia07@gmail.com`.
4. Método de login: **One-time PIN** (já vem ativo — o código chega no seu e-mail).
5. Crie uma **segunda** aplicação Self-hosted só para a mídia que o Instagram baixa:
   - Nome `CRM midia publica`, domínio `crm.luccasmadia.com.br`, caminho `publico/*`
   - Política: ação **Bypass**, regra **Include → Everyone**
6. Teste numa aba anônima:
   - `https://crm.luccasmadia.com.br` → deve pedir o código por e-mail.
   - `https://crm.luccasmadia.com.br/publico/midia/x/y` → deve dar "não encontrado" do CRM (e **não** a tela de login).

---

## Parte 5 — Token do Instagram com permissão de publicar

O token atual só lê o perfil. Para publicar, gere um novo com a permissão de publicação.

1. Em **developers.facebook.com → Meus apps**, abra o app que você já usa para o CRM.
2. Vá em **Instagram → Configuração da API com login do Instagram**.
3. Em **Permissões**, confirme que estão incluídas `instagram_business_basic` **e** `instagram_business_content_publish` (adicione a segunda se faltar).
4. Em **Gerar tokens de acesso**, clique em **Gerar token** na sua conta, entre com o Instagram e **autorize a publicação** quando ele pedir.
5. Copie o token e cole em **CRM → Configurações → Instagram → Colar novo token**.

> Se ao publicar aparecer "O token não tem permissão para publicar", repita esta parte conferindo o passo 3.
