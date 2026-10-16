# CRM Madia

CRM pessoal e local: clientes, funil, financeiro, tarefas, planejamento de conteúdo e publicação de projetos no portfólio.

## Rodar

```bash
npm install
npm start        # API em 127.0.0.1:5174 + interface em http://127.0.0.1:5173
npm test
```

Os dados ficam em `data/` (`crm.db` e `uploads/`), que é ignorada pelo git. Faça backup por **Configurações → Exportar backup** ou copiando a pasta `data/` com o CRM parado.

## Portfólio

Em **Configurações**, informe o caminho do clone local do repositório do portfólio. "Publicar" grava apenas `src/data/projects.json` e `public/projects/`; "Commitar e enviar" faz commit só desses caminhos e `git push` (a Vercel publica sozinha).

## Instagram

A tela **Conteúdo** mostra o grid real do seu Instagram (capas, números de cada post e crescimento de seguidores), com os posts planejados como "Pronto" aparecendo antes, como prévia. Quando um post sai no Instagram com a mesma legenda de um planejado, o CRM liga os dois sozinho.

A conta precisa ser **Profissional** (Criador ou Empresa). Para conectar, uma vez só:

1. Em developers.facebook.com, crie um app do tipo "Empresa" e adicione o produto **Instagram** → "API com login do Instagram".
2. Em "Funções do app → Testadores do Instagram", adicione sua conta e aceite o convite no Instagram (Configurações → Apps e sites).
3. Na configuração da API, em "Gerar tokens de acesso", clique em "Adicionar conta", entre com o Instagram e copie o token.
4. Em **Configurações → Instagram**, cole o token e clique em Conectar.

O CRM sincroniza ao iniciar, a cada 6 horas e pelo botão "Atualizar agora", e renova o acesso sozinho antes dos 60 dias. As capas ficam em `data/uploads/instagram/`.
