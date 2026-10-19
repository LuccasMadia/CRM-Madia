// O CRM não tem login e roda só nesta máquina. Ele escuta apenas em 127.0.0.1, então só o cloudflared local
// chega pelo host público (crm.luccasmadia.com.br), e o login nesse caminho é feito pelo Cloudflare Access.
// Não validamos o JWT do Access aqui: como o servidor só escuta em 127.0.0.1, não há conexão externa direta
// que pudesse contornar o Access e apresentar um JWT falso.
// Bloqueamos o que outro site aberto no navegador conseguiria fazer:
// - Host diferente de 127.0.0.1/localhost/host público indica DNS rebinding;
// - escrita sem o cabeçalho X-CRM indica formulário de outro site (formulários não enviam cabeçalhos próprios).
export const HOST_PUBLICO = process.env.CRM_HOST_PUBLICO || 'crm.luccasmadia.com.br';
export const URL_PUBLICA = `https://${HOST_PUBLICO}`;

const HOSTS_PERMITIDOS = new Set(['127.0.0.1', 'localhost', HOST_PUBLICO]);
const METODOS_DE_LEITURA = new Set(['GET', 'HEAD', 'OPTIONS']);

function hostSemPorta(req) {
  return (req.headers.host ?? '').replace(/:\d+$/, '');
}

export function ehAcessoPublico(req) {
  return hostSemPorta(req) === HOST_PUBLICO;
}

export function protegerLocal(req, res, next) {
  if (!HOSTS_PERMITIDOS.has(hostSemPorta(req))) return res.status(403).json({ erro: 'Host não permitido' });
  if (!METODOS_DE_LEITURA.has(req.method) && req.headers['x-crm'] !== '1') {
    return res.status(403).json({ erro: 'Requisição sem o cabeçalho X-CRM recusada' });
  }
  next();
}
