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
