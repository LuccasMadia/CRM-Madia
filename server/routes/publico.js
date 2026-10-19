import { Router } from 'express';
import path from 'node:path';

// Única rota alcançável sem login pelo host público (o Cloudflare Access libera /publico/*).
// O Instagram baixa daqui a mídia enquanto o post é publicado; tudo que não bater exatamente vira 404 vazio.
export function rotasPublico({ db, dataDir }) {
  const router = Router();
  const uploadsDir = path.join(dataDir, 'uploads');

  const buscar = db.prepare(`
    SELECT m.arquivo FROM conteudos c
    JOIN conteudo_midias m ON m.conteudo_id = c.id
    WHERE c.publicacao_token = ? AND c.estado = 'publicando' AND m.arquivo = ?
    LIMIT 1`);

  router.get('/midia/:token/:arquivo', (req, res) => {
    const { token, arquivo } = req.params;
    if (!token || /[/\\]|\.\./.test(arquivo)) return res.status(404).end();
    const linha = buscar.get(token, arquivo);
    if (!linha) return res.status(404).end();
    res.set('Cache-Control', 'no-store');
    res.sendFile(linha.arquivo, { root: uploadsDir, dotfiles: 'deny' }, (erro) => {
      if (erro && !res.headersSent) res.status(404).end();
    });
  });

  router.use((req, res) => res.status(404).end());
  return router;
}
