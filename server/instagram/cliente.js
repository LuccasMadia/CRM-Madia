// Instagram API com login do Instagram. Sem versão na URL: a Meta usa a mais
// antiga ainda suportada, o que evita o CRM quebrar quando uma versão expira.
const BASE = 'https://graph.instagram.com';
// children: a capa de um carrossel vem do 1º item, que pode ser um vídeo.
const CAMPOS_CAPA = 'media_type,media_url,thumbnail_url,children{media_type,media_url,thumbnail_url}';
const CAMPOS_MIDIA = `id,caption,media_product_type,permalink,timestamp,like_count,comments_count,${CAMPOS_CAPA}`;
const METRICAS = { reach: 'alcance', views: 'visualizacoes', saved: 'salvamentos', shares: 'compartilhamentos' };
const DIA_MS = 24 * 60 * 60 * 1000;

export class ErroInstagram extends Error {
  constructor(mensagem, { status = 0, tokenInvalido = false, semPermissao = false } = {}) {
    super(mensagem);
    this.status = status;
    this.tokenInvalido = tokenInvalido;
    this.semPermissao = semPermissao;
  }
}

const MSG_SEM_PERMISSAO =
  'O token não tem permissão para publicar. Em Configurações → Instagram, gere um token novo com a permissão de publicação e cole de novo.';

export function criarClienteInstagram({ token, fetch = globalThis.fetch, agora = () => new Date() }) {
  // Envia a requisição e trata resposta/erro; compartilhado por GET e POST.
  async function requisitar(url, init) {
    let resposta;
    try {
      resposta = await fetch(url, init);
    } catch {
      throw new ErroInstagram('Não foi possível falar com o Instagram. Verifique a internet.');
    }
    const corpo = await resposta.json().catch(() => ({}));
    if (!resposta.ok || corpo.error) {
      const erro = corpo.error;
      const tokenInvalido = erro?.code === 190 || resposta.status === 401;
      const semPermissao = !tokenInvalido && (erro?.code === 10 || erro?.code === 200 || /permiss/i.test(erro?.message ?? ''));
      const mensagem = semPermissao ? MSG_SEM_PERMISSAO : (erro?.message ?? `Instagram respondeu ${resposta.status}`);
      throw new ErroInstagram(mensagem, { status: resposta.status, tokenInvalido, semPermissao });
    }
    return corpo;
  }

  async function obter(caminhoOuUrl, parametros = {}) {
    const url = new URL(caminhoOuUrl, BASE);
    for (const [chave, valor] of Object.entries(parametros)) url.searchParams.set(chave, valor);
    url.searchParams.set('access_token', token);
    return requisitar(url);
  }

  function enviar(caminho, parametros = {}) {
    const corpo = new URLSearchParams({ ...parametros, access_token: token });
    return requisitar(new URL(caminho, BASE), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: corpo.toString(),
    });
  }

  async function criarContainer(usuarioId, parametros) {
    return (await enviar(`/${usuarioId}/media`, parametros)).id;
  }

  async function statusContainer(id) {
    const r = await obter(`/${id}`, { fields: 'status_code,status' });
    return { status: r.status_code, mensagem: r.status ?? null };
  }

  async function publicarContainer(usuarioId, creationId) {
    return (await enviar(`/${usuarioId}/media_publish`, { creation_id: creationId })).id;
  }

  async function perfil() {
    const p = await obter('/me', { fields: 'user_id,username,followers_count,media_count' });
    return { id: String(p.user_id), username: p.username, followers_count: p.followers_count, media_count: p.media_count };
  }

  async function midias({ desde } = {}) {
    const limite = desde ? Date.parse(desde) : -Infinity;
    const todas = [];
    let pagina = await obter('/me/media', { fields: CAMPOS_MIDIA, limit: 50 });
    for (;;) {
      const dados = pagina.data ?? [];
      todas.push(...dados.filter((m) => Date.parse(m.timestamp) >= limite));
      const ultima = dados.at(-1);
      if (!pagina.paging?.next || !ultima || Date.parse(ultima.timestamp) < limite) break;
      pagina = await obter(pagina.paging.next);
    }
    return todas;
  }

  const midia = (id) => obter(`/${id}`, { fields: `id,${CAMPOS_CAPA}` });

  async function insights(midiaId) {
    const vazio = Object.fromEntries(Object.values(METRICAS).map((nome) => [nome, null]));
    try {
      const { data = [] } = await obter(`/${midiaId}/insights`, { metric: Object.keys(METRICAS).join(',') });
      for (const item of data) if (METRICAS[item.name]) vazio[METRICAS[item.name]] = item.values?.[0]?.value ?? null;
      return vazio;
    } catch {
      return vazio;
    }
  }

  // follower_count devolve seguidores novos por dia (últimos 30 dias, sem hoje).
  // O total de cada dia é estimado de trás para frente a partir do total atual;
  // deixar de seguir não entra na conta, então é uma aproximação.
  async function historicoSeguidores(totalAtual) {
    try {
      const fim = agora();
      const { data = [] } = await obter('/me/insights', {
        metric: 'follower_count',
        period: 'day',
        since: String(Math.floor((fim.getTime() - 30 * DIA_MS) / 1000)),
        until: String(Math.floor(fim.getTime() / 1000)),
      });
      const valores = [...(data[0]?.values ?? [])].sort((a, b) => a.end_time.localeCompare(b.end_time));
      let total = totalAtual;
      const serie = [];
      for (let i = valores.length - 1; i >= 0; i--) {
        const dia = new Date(Date.parse(valores[i].end_time) - DIA_MS).toISOString().slice(0, 10);
        serie.unshift({ dia, seguidores: total });
        total -= valores[i].value ?? 0;
      }
      return serie;
    } catch {
      return [];
    }
  }

  async function renovarToken() {
    const r = await obter('/refresh_access_token', { grant_type: 'ig_refresh_token' });
    return { token: r.access_token, expiraEm: new Date(agora().getTime() + r.expires_in * 1000).toISOString() };
  }

  return { perfil, midias, midia, insights, historicoSeguidores, renovarToken, criarContainer, statusContainer, publicarContainer };
}
