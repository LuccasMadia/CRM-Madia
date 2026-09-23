// O CRM não tem login (roda só nesta máquina), então bloqueamos o que outro site aberto no navegador conseguiria fazer:
// - Host diferente de 127.0.0.1/localhost indica DNS rebinding;
// - escrita sem o cabeçalho X-CRM indica formulário de outro site (formulários não enviam cabeçalhos próprios).
const HOSTS_PERMITIDOS = new Set(['127.0.0.1', 'localhost']);
const METODOS_DE_LEITURA = new Set(['GET', 'HEAD', 'OPTIONS']);

export function protegerLocal(req, res, next) {
  const host = (req.headers.host ?? '').replace(/:\d+$/, '');
  if (!HOSTS_PERMITIDOS.has(host)) return res.status(403).json({ erro: 'Host não permitido' });
  if (!METODOS_DE_LEITURA.has(req.method) && req.headers['x-crm'] !== '1') {
    return res.status(403).json({ erro: 'Requisição sem o cabeçalho X-CRM recusada' });
  }
  next();
}
