# CRM Madia

CRM pessoal e local: clientes, funil, financeiro, tarefas, planejamento de conteúdo e publicação de projetos no portfólio.

## Rodar

```bash
npm install
npm start        # API em 127.0.0.1:5174 + interface em http://127.0.0.1:5173
npm test
```

### Em produção (pm2 + túnel)

O Express serve também o front compilado (`dist/`), então só o processo `crm-madia-api` precisa rodar:

```bash
npm install && npm run build && pm2 restart crm-madia-api
```

O pm2 roda sem `watch`: qualquer mudança de código ou migration só vale depois do `pm2 restart crm-madia-api`.

**Atualizar com migration nova**, nesta ordem:

1. Pare a API e faça backup do banco e das mídias em `data/backup-antes-<número>-<data>` (ex.: `data/backup-antes-024-2026-11-02`). Copie os três arquivos do banco: o SQLite guarda as alterações recentes em `crm.db-wal`, então o `crm.db` sozinho pode estar quase vazio. No PowerShell:

   ```powershell
   pm2 stop crm-madia-api
   $destino = "data/backup-antes-024-$(Get-Date -Format yyyy-MM-dd)"
   New-Item -ItemType Directory -Force $destino
   Copy-Item data/crm.db, data/crm.db-wal, data/crm.db-shm $destino -ErrorAction SilentlyContinue
   Copy-Item -Recurse data/uploads $destino
   ```

2. Atualize e reinicie: `npm install && npm run build && pm2 restart crm-madia-api` (a migration roda ao subir).

O desenvolvimento continua com `npm run dev` (ou `npm start`). Para expor o CRM em `crm.luccasmadia.com.br`, siga o passo a passo em [docs/tunel-cloudflare.md](docs/tunel-cloudflare.md).

Os dados ficam em `data/` (`crm.db` e `uploads/`), que é ignorada pelo git. Faça backup por **Configurações → Exportar backup** ou copiando a pasta `data/` inteira com o CRM parado (incluindo `crm.db-wal` e `crm.db-shm`).

## Portfólio

Em **Configurações**, informe o caminho do clone local do repositório do portfólio. "Publicar" grava apenas `src/data/projects.json` e `public/projects/`; "Commitar e enviar" faz commit só desses caminhos e `git push` (a Vercel publica sozinha).

## Sites no ar e corte por pagamento

O CRM confere a cada 5 minutos se os sites cadastrados estão no ar e avisa no **Início** quando algum cai ou quando uma mensalidade atrasa.

1. Em **Configurações → Vercel**, cole o token da Vercel (vercel.com → Account Settings → Tokens) e, se quiser, ajuste os dias entre avisar o cliente e tirar do ar.
2. Em cada site (abra o projeto → aba **Hospedagem**), informe o endereço e escolha o projeto da Vercel. Sites instalados no cliente ficam como "Sem hospedagem".
3. "Tirar do ar" e "Colocar no ar" só acontecem quando você clica e confirma; o CRM nunca pausa sozinho.

A checagem e os avisos só rodam com o PC ligado e o CRM no ar (pm2).

## Instagram

A tela **Conteúdo** mostra o grid real do seu Instagram (capas, números de cada post e crescimento de seguidores), com os posts planejados como "Pronto" aparecendo antes, como prévia. Quando um post sai no Instagram com a mesma legenda de um planejado, o CRM liga os dois sozinho.

A conta precisa ser **Profissional** (Criador ou Empresa). Para conectar, uma vez só:

1. Em developers.facebook.com, crie um app do tipo "Empresa" e adicione o produto **Instagram** → "API com login do Instagram".
2. Em "Funções do app → Testadores do Instagram", adicione sua conta e aceite o convite no Instagram (Configurações → Apps e sites).
3. Na configuração da API, em "Permissões", confirme que estão incluídas `instagram_business_basic` **e** `instagram_business_content_publish` (a segunda permite publicar pelo CRM).
4. Em "Gerar tokens de acesso", clique em "Adicionar conta", entre com o Instagram, autorize a publicação quando ele pedir e copie o token.
5. Em **Configurações → Instagram**, cole o token e clique em Conectar.

O CRM sincroniza ao iniciar, a cada 6 horas e pelo botão "Atualizar agora", e renova o acesso sozinho antes dos 60 dias. As capas ficam em `data/uploads/instagram/`.
