import { describe, it, expect } from 'vitest';
import { criarClienteInstagram, ErroInstagram } from './cliente.js';
import { fetchFalso } from '../test/instagramFalso.js';

const midia = (id, timestamp) => ({ id, timestamp, media_type: 'IMAGE', media_product_type: 'FEED' });
const cliente = (rotas, extra = {}) => {
  const falso = fetchFalso(rotas);
  return { ...falso, ig: criarClienteInstagram({ token: 'tok', fetch: falso.fetch, ...extra }) };
};

describe('cliente do Instagram', () => {
  it('lê o perfil usando user_id como id e manda o token', async () => {
    const { ig, chamadas } = cliente({
      '/me': { user_id: '178', username: 'luccasmadia', followers_count: 1284, media_count: 40 },
    });
    expect(await ig.perfil()).toEqual({ id: '178', username: 'luccasmadia', followers_count: 1284, media_count: 40 });
    expect(chamadas[0].searchParams.get('access_token')).toBe('tok');
  });

  it('segue a paginação das mídias', async () => {
    const { ig } = cliente({
      '/me/media': (url) =>
        url.searchParams.get('after') === 'p2'
          ? { data: [midia('3', '2026-08-01T10:00:00+0000')] }
          : {
              data: [midia('1', '2026-10-10T10:00:00+0000'), midia('2', '2026-09-10T10:00:00+0000')],
              paging: { next: 'https://graph.instagram.com/me/media?after=p2&access_token=tok' },
            },
    });
    expect((await ig.midias()).map((m) => m.id)).toEqual(['1', '2', '3']);
  });

  it('com desde, para de paginar e descarta as anteriores', async () => {
    const { ig, chamadas } = cliente({
      '/me/media': {
        data: [midia('1', '2026-10-10T10:00:00+0000'), midia('2', '2026-08-10T10:00:00+0000')],
        paging: { next: 'https://graph.instagram.com/me/media?after=p2' },
      },
    });
    expect((await ig.midias({ desde: '2026-09-01T00:00:00.000Z' })).map((m) => m.id)).toEqual(['1']);
    expect(chamadas).toHaveLength(1);
  });

  it('insights: converte nomes e deixa nulo o que falta', async () => {
    const { ig } = cliente({
      '/m1/insights': { data: [{ name: 'reach', values: [{ value: 1870 }] }, { name: 'saved', values: [{ value: 21 }] }] },
    });
    expect(await ig.insights('m1')).toEqual({ alcance: 1870, visualizacoes: null, salvamentos: 21, compartilhamentos: null });
  });

  it('insights com erro devolve tudo nulo sem lançar', async () => {
    const { ig } = cliente({ '/m1/insights': { status: 400, corpo: { error: { code: 100, message: 'x' } } } });
    expect(await ig.insights('m1')).toEqual({ alcance: null, visualizacoes: null, salvamentos: null, compartilhamentos: null });
  });

  it('token inválido vira ErroInstagram com tokenInvalido', async () => {
    const { ig } = cliente({ '/me': { status: 400, corpo: { error: { code: 190, message: 'Invalid OAuth access token' } } } });
    const erro = await ig.perfil().catch((e) => e);
    expect(erro).toBeInstanceOf(ErroInstagram);
    expect(erro.tokenInvalido).toBe(true);
  });

  it('erro comum não marca tokenInvalido', async () => {
    const { ig } = cliente({ '/me': { status: 500, corpo: { error: { code: 2, message: 'Service unavailable' } } } });
    const erro = await ig.perfil().catch((e) => e);
    expect(erro.tokenInvalido).toBe(false);
  });

  it('renova o token calculando a expiração', async () => {
    const { ig, chamadas } = cliente(
      { '/refresh_access_token': { access_token: 'novo', token_type: 'bearer', expires_in: 5184000 } },
      { agora: () => new Date('2026-10-16T00:00:00Z') },
    );
    expect(await ig.renovarToken()).toEqual({ token: 'novo', expiraEm: '2026-12-15T00:00:00.000Z' });
    expect(chamadas[0].searchParams.get('grant_type')).toBe('ig_refresh_token');
  });

  it('histórico de seguidores: soma de trás para frente a partir do total atual', async () => {
    const { ig } = cliente(
      {
        '/me/insights': {
          data: [{
            name: 'follower_count',
            values: [
              { value: 2, end_time: '2026-10-14T07:00:00+0000' },
              { value: 3, end_time: '2026-10-15T07:00:00+0000' },
            ],
          }],
        },
      },
      { agora: () => new Date('2026-10-16T12:00:00Z') },
    );
    expect(await ig.historicoSeguidores(100)).toEqual([
      { dia: '2026-10-13', seguidores: 97 },
      { dia: '2026-10-14', seguidores: 100 },
    ]);
  });

  it('histórico de seguidores com erro devolve lista vazia', async () => {
    const { ig } = cliente({ '/me/insights': { status: 400, corpo: { error: { code: 100 } } } });
    expect(await ig.historicoSeguidores(100)).toEqual([]);
  });
});
