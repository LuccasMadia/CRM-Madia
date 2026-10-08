# Pagamento Pix direto no banco (Web Share) — Design

## Contexto

A página pública `/pix/:id` ([[2026-10-07-pix-pagina-publica-design]]) mostra um QR Pix (`qrcode.react`) + copia-e-cola. O Lucca testou escaneando o QR com a câmera do banco em `https://luccasmadia.com.br/pix/5` e o banco não reconheceu o código (não é erro de chave, é não-reconhecimento do QR). O copia-e-cola, testado em seguida, funciona.

A pessoa que acessa essa página normalmente já chegou lá pelo celular (via o QR físico do Canva, que redireciona pra essa URL). Fazia pouco sentido pedir pra ela escanear *outro* QR no mesmo celular onde a página já está aberta.

**Quem usa:** clientes finais dos clientes do Lucca (ex.: alguém pagando a Popy, o Rango do Bixo), cada um com banco diferente e desconhecido — não dá pra assumir qual app bancário a pessoa tem.

**Por que não dá pra abrir o app do banco direto na tela de pagamento:** não existe no Brasil um esquema de URL padrão entre bancos para isso. O que existe de forma ampla é o app do banco detectar um código Pix recebido via compartilhamento de texto (Web Share) ou colado da área de transferência — a maioria dos grandes bancos (Nubank, Itaú, BB, Caixa, Bradesco, Inter) reconhece esse padrão.

## Escopo

Só o repositório do Portfólio (`Portifolio Luccas Madia`), arquivo `src/pages/PixPage.jsx` + `PixPage.css` + teste. **Nada muda no CRM-Madia nem no backend** — o código Pix já gerado e publicado continua o mesmo.

**Fora de escopo:** qualquer link/deep-link específico de banco; confirmação de pagamento; mudanças na geração do código Pix (`gerarCodigoPix`); mudanças no fluxo de publicação (CRM → `src/data/pix.json`).

## Comportamento da página `/pix/:id`

Detecção via feature check (`typeof navigator.share === 'function'`), sem sniffing de user agent:

**Com suporte a Web Share (celular, maioria dos casos):**
- Botão principal **"Pagar com Pix"**. Ao clicar:
  1. Copia o código pro clipboard silenciosamente (`navigator.clipboard.writeText(codigo)`) — rede de segurança, não bloqueia o passo 2.
  2. Chama `navigator.share({ text: codigo })` — **apenas o código puro**, sem título/URL/texto extra, pra não quebrar a detecção de Pix pelo app do banco.
  3. Se o usuário cancelar o share (erro `AbortError`), não mostra nada — o código já foi copiado no passo 1.
  4. Se `share` falhar por outro motivo, mostra inline: "Não foi possível abrir o compartilhamento. O código já foi copiado — abra seu banco e cole."
- Abaixo do botão, sempre visível: bloco de texto com o código copia-e-cola + botão "Copiar" (handler já existe, mantém), com instrução: "Se seu banco não detectar automaticamente, cole o código na opção 'Pix Copia e Cola'."

**Sem suporte a Web Share (desktop, navegadores antigos):**
- Sem o botão "Pagar com Pix".
- Só o bloco copia-e-cola + "Copiar", mesma instrução acima.
- **QR removido por completo** — não é renderizado em nenhum caso.

**Cliente/id não encontrado:** inalterado — "Código Pix não encontrado."

## Remoção da dependência de QR

- `qrcode.react` sai do `package.json` do Portfólio.
- Import de `QRCodeSVG` removido de `PixPage.jsx`.
- Estilos de QR removidos de `PixPage.css`.

## Testes (`src/pages/PixPage.test.jsx`)

- Mock de `navigator.share` presente: clique em "Pagar com Pix" chama `navigator.share({ text: codigo })` e `navigator.clipboard.writeText(codigo)` (ordem: clipboard antes do share, mas teste só precisa confirmar que ambos foram chamados com o código certo).
- `navigator.share` rejeitando com `AbortError`: nenhuma mensagem de erro aparece.
- `navigator.share` rejeitando com outro erro: mostra a mensagem de fallback.
- Mock de `navigator.share` ausente (`undefined`): botão "Pagar com Pix" não é renderizado; só "Copiar" aparece.
- Remove os testes/asserts que verificavam a renderização do `QRCodeSVG`.
- Mantém o teste de "Código Pix não encontrado" e o teste existente do botão "Copiar" (mesma técnica `vi.spyOn(navigator.clipboard, 'writeText')` após `userEvent.setup()`, [[feedback_jsdom_clipboard_tests]]).
