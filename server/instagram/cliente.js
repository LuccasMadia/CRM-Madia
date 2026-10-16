// Instagram API com login do Instagram. Sem versão na URL: a Meta usa a mais
// antiga ainda suportada, o que evita o CRM quebrar quando uma versão expira.
const BASE = 'https://graph.instagram.com';
const CAMPOS_MIDIA = 'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count';
const METRICAS = { reach: 'alcance', views: 'visualizacoes', saved: 'salvamentos', shares: 'compartilhamentos' };
const DIA_MS = 24 * 60 * 60 * 1000;

export class ErroInstagram extends Error {
  constructor(mensagem, { status = 0, tokenInvalido = false } = {}) {
    super(mensagem);
    this.status = status;
    this.tokenInvalido = tokenInvalido;
  }
}

export function criarClienteInstagram({ token, fetch = globalThis.fetch, agora = () => new Date() }) {
  async function obter(caminhoOuUrl, parametros = {}) {
    const url = new URL(caminhoOuUrl, BASE);
    for (const [chave, valor] of Object.entries(parametros)) url.searchParams.set(chave, valor);
    url.searchParams.set('access_token', token);
    let resposta;
    try {
      resposta = await fetch(url);
    } catch {
      throw new ErroInstagram('Não foi possível falar com o Instagram. Verifique a internet.');
    }
    const corpo = await resposta.json().catch(() => ({}));
    if (!resposta.ok || corpo.error) {
      const tokenInvalido = corpo.error?.code === 190 || resposta.status === 401;
      throw new ErroInstagram(corpo.error?.message ?? `Instagram respondeu ${resposta.status}`, { status: resposta.status, tokenInvalido });
    }
    return corpo;
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

  const midia = (id) => obter(`/${id}`, { fields: 'id,media_type,media_url,thumbnail_url' });

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

  return { perfil, midias, midia, insights, historicoSeguidores, renovarToken };
}
