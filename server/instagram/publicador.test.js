import { describe, it, expect, beforeEach, vi } from 'vitest';
import { openDb } from '../db/connection.js';
import { definirConfig } from '../repos/config.js';
import { ErroHttp, ErroValidacao } from '../http/erros.js';
import { fetchFalso } from '../test/instagramFalso.js';
import { criarPublicador } from './publicador.js';

const URL_PUBLICA = 'https://crm.luccasmadia.com.br';
const MSG_INTERROMPIDA =
  'A publicação foi interrompida depois de enviada. Confira no Instagram se o post saiu antes de tentar de novo.';
let db;

beforeEach(() => {
  db = openDb(':memory:');
  definirConfig(db, 'instagram_token', 'tok');
});

function criarConteudo({ tipo = 'reels', estado = 'pronto', legenda = 'Legenda do post', midias = null, extra = {} } = {}) {
  const { lastInsertRowid } = db
    .prepare("INSERT INTO conteudos (tipo, titulo, legenda, estado, criado_em, atualizado_em) VALUES (?, 'T', ?, ?, 'x', 'x')")
    .run(tipo, legenda, estado);
  const id = Number(lastInsertRowid);
  const lista = midias ?? (tipo === 'reels' ? [{ arquivo: 'video.mp4', tipo: 'video' }] : [{ arquivo: 'foto.jpg', tipo: 'imagem' }]);
  lista.forEach((m, ordem) =>
    db.prepare('INSERT INTO conteudo_midias (conteudo_id, arquivo, tipo, ordem) VALUES (?, ?, ?, ?)').run(id, m.arquivo, m.tipo, ordem),
  );
  for (const [coluna, valor] of Object.entries(extra)) db.prepare(`UPDATE conteudos SET ${coluna} = ? WHERE id = ?`).run(valor, id);
  return id;
}

const conteudo = (id) => ({ ...db.prepare('SELECT * FROM conteudos WHERE id = ?').get(id) });

function rotas(extra = {}) {
  let n = 0;
  return {
    '/me': { user_id: '178', username: 'luccasmadia' },
    'POST /178/media': () => ({ id: `C${++n}` }),
    'POST /178/media_publish': { id: 'M1' },
    ...extra,
  };
}

function publicador(rotasFalsas = rotas(), opcoes = {}) {
  const falso = fetchFalso(rotasFalsas);
  const sincronizar = opcoes.sincronizar ?? vi.fn(async () => {});
  const pub = criarPublicador({
    db,
    fetch: falso.fetch,
    urlPublica: URL_PUBLICA,
    sincronizar,
    esperar: async () => {},
    intervaloMs: 10,
    ...opcoes,
  });
  const posts = () => falso.requisicoes.filter((r) => r.metodo === 'POST');
  return { pub, falso, posts, sincronizar };
}

const finalizado = (id = 'C1') => ({ [`/${id}`]: { status_code: 'FINISHED' } });

describe('publicador — reels e post', () => {
  it('reels: cria o contêiner, espera FINISHED e publica', async () => {
    const id = criarConteudo();
    const { pub, posts, sincronizar } = publicador(rotas(finalizado()));
    await pub.iniciar(id);

    expect(posts().map((r) => r.url.pathname)).toEqual(['/178/media', '/178/media_publish']);
    const [criacao, publicacao] = posts();
    expect(criacao.corpo).toMatchObject({ media_type: 'REELS', caption: 'Legenda do post' });
    expect(criacao.corpo.video_url).toMatch(new RegExp(`^${URL_PUBLICA}/publico/midia/[0-9a-f]{48}/video\\.mp4$`));
    expect(publicacao.corpo.creation_id).toBe('C1');

    const final = conteudo(id);
    expect(final).toMatchObject({ estado: 'publicado', publicacao_midia_id: 'M1', publicacao_erro: null, publicacao_token: null });
    expect(final.publicacao_enviado_em).not.toBeNull();
    expect(sincronizar).toHaveBeenCalledTimes(1);
  });

  it('post: um contêiner com image_url e caption', async () => {
    const id = criarConteudo({ tipo: 'post' });
    const { pub, posts } = publicador(rotas(finalizado()));
    await pub.iniciar(id);
    expect(posts()[0].corpo).toMatchObject({ caption: 'Legenda do post' });
    expect(posts()[0].corpo.image_url).toMatch(/\/publico\/midia\/[0-9a-f]{48}\/foto\.jpg$/);
    expect(posts()[0].corpo.media_type).toBeUndefined();
    expect(conteudo(id).estado).toBe('publicado');
  });

  it('consulta o status até FINISHED', async () => {
    const id = criarConteudo();
    const respostas = ['IN_PROGRESS', 'IN_PROGRESS', 'FINISHED'];
    const esperar = vi.fn(async () => {});
    const { pub, falso } = publicador(rotas({ '/C1': () => ({ status_code: respostas.shift() }) }), { esperar });
    await pub.iniciar(id);
    expect(falso.chamadas.filter((u) => u.pathname === '/C1')).toHaveLength(3);
    expect(esperar).toHaveBeenCalledWith(10);
    expect(conteudo(id).estado).toBe('publicado');
  });
});

describe('publicador — carrossel', () => {
  it('cria um contêiner por imagem e um CAROUSEL com os filhos', async () => {
    const midias = ['a.jpg', 'b.jpg', 'c.jpg'].map((arquivo) => ({ arquivo, tipo: 'imagem' }));
    const id = criarConteudo({ tipo: 'carrossel', midias });
    const { pub, posts } = publicador(rotas(finalizado('C4')));
    await pub.iniciar(id);

    const criacoes = posts().filter((r) => r.url.pathname === '/178/media');
    expect(criacoes).toHaveLength(4);
    criacoes.slice(0, 3).forEach((r, i) => {
      expect(r.corpo.is_carousel_item).toBe('true');
      expect(r.corpo.image_url).toMatch(new RegExp(`/publico/midia/[0-9a-f]{48}/${midias[i].arquivo.replace('.', '\\.')}$`));
    });
    expect(criacoes[3].corpo).toMatchObject({ media_type: 'CAROUSEL', children: 'C1,C2,C3', caption: 'Legenda do post' });
    expect(posts().at(-1).corpo.creation_id).toBe('C4');
    expect(conteudo(id).estado).toBe('publicado');
  });

  it('falha ao criar um filho → falhou sem criar o CAROUSEL', async () => {
    const midias = ['a.jpg', 'b.jpg'].map((arquivo) => ({ arquivo, tipo: 'imagem' }));
    const id = criarConteudo({ tipo: 'carrossel', midias });
    let n = 0;
    const { pub, posts } = publicador(rotas({
      'POST /178/media': () => (++n === 2 ? { status: 400, corpo: { error: { code: 9004, message: 'Imagem inválida' } } } : { id: `C${n}` }),
    }));
    await pub.iniciar(id);
    expect(posts()).toHaveLength(2);
    expect(conteudo(id)).toMatchObject({ estado: 'falhou', publicacao_erro: 'Imagem inválida', publicacao_container_id: null });
  });
});

describe('publicador — trava e validação', () => {
  it('iniciar duas vezes seguidas: a segunda lança 409 e só um contêiner é criado', async () => {
    const id = criarConteudo();
    const { pub, posts } = publicador(rotas(finalizado()));
    const primeira = pub.iniciar(id);
    let erro;
    try {
      pub.iniciar(id);
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(ErroHttp);
    expect(erro.status).toBe(409);
    expect(erro.message).toBe('Este post já está sendo publicado.');
    await primeira;
    expect(posts().filter((r) => r.url.pathname === '/178/media')).toHaveLength(1);
  });

  it('a trava é síncrona: estado publicando e token gravados assim que iniciar volta', async () => {
    const id = criarConteudo({ estado: 'falhou', extra: { publicacao_erro: 'antigo', publicacao_enviado_em: 'velho' } });
    const { pub } = publicador(rotas(finalizado()));
    const processamento = pub.iniciar(id);
    const travado = conteudo(id);
    expect(travado).toMatchObject({ estado: 'publicando', publicacao_erro: null, publicacao_enviado_em: null });
    expect(travado.publicacao_token).toMatch(/^[0-9a-f]{48}$/);
    await processamento;
  });

  it('post já publicado → 409', () => {
    const id = criarConteudo({ estado: 'publicado' });
    const { pub } = publicador();
    expect(() => pub.iniciar(id)).toThrow('Este post já está sendo publicado.');
  });

  it('conteúdo inválido → ErroValidacao com campo publicacao e nada muda', () => {
    const id = criarConteudo({ tipo: 'reels', midias: [{ arquivo: 'foto.jpg', tipo: 'imagem' }] });
    const { pub, falso } = publicador();
    let erro;
    try {
      pub.iniciar(id);
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(ErroValidacao);
    expect(erro.erros).toEqual([{ campo: 'publicacao', mensagem: 'Reels precisa de exatamente 1 vídeo.' }]);
    expect(conteudo(id).estado).toBe('pronto');
    expect(falso.chamadas).toHaveLength(0);
  });
});

describe('publicador — erros', () => {
  it('status ERROR → falhou com a mensagem e o container id é limpo', async () => {
    const id = criarConteudo();
    const { pub, posts } = publicador(rotas({ '/C1': { status_code: 'ERROR', status: 'Formato de vídeo não suportado' } }));
    await pub.iniciar(id);
    expect(conteudo(id)).toMatchObject({
      estado: 'falhou',
      publicacao_erro: 'O Instagram recusou a mídia: Formato de vídeo não suportado',
      publicacao_container_id: null,
      publicacao_token: null,
    });
    expect(posts().some((r) => r.url.pathname === '/178/media_publish')).toBe(false);
  });

  it('status EXPIRED sem mensagem usa o próprio status', async () => {
    const id = criarConteudo();
    const { pub } = publicador(rotas({ '/C1': { status_code: 'EXPIRED' } }));
    await pub.iniciar(id);
    expect(conteudo(id).publicacao_erro).toBe('O Instagram recusou a mídia: EXPIRED');
  });

  it('estouro do limite de tempo → falhou com a mensagem de demora', async () => {
    const id = criarConteudo();
    let relogio = 0;
    const { pub } = publicador(rotas({ '/C1': { status_code: 'IN_PROGRESS' } }), {
      agora: () => relogio,
      esperar: async (ms) => {
        relogio += ms;
      },
      intervaloMs: 1000,
      limiteMs: 5000,
    });
    await pub.iniciar(id);
    expect(conteudo(id)).toMatchObject({
      estado: 'falhou',
      publicacao_erro: 'O Instagram demorou demais para processar o vídeo. Tente de novo.',
      publicacao_container_id: null,
    });
  });

  it('token sem permissão → falhou com a mensagem do cliente', async () => {
    const id = criarConteudo();
    const { pub } = publicador(rotas({
      'POST /178/media': { status: 403, corpo: { error: { code: 10, message: 'Application does not have permission' } } },
    }));
    await pub.iniciar(id);
    expect(conteudo(id).estado).toBe('falhou');
    expect(conteudo(id).publicacao_erro).toMatch(/^O token não tem permissão para publicar\./);
  });

  it('sem token conectado → falhou pedindo para conectar', async () => {
    db.exec("DELETE FROM config WHERE chave = 'instagram_token'");
    const id = criarConteudo();
    const { pub, falso } = publicador();
    await pub.iniciar(id);
    expect(conteudo(id)).toMatchObject({
      estado: 'falhou',
      publicacao_erro: 'O Instagram não está conectado. Conecte em Configurações → Instagram.',
    });
    expect(falso.chamadas).toHaveLength(0);
  });

  it('o id do contêiner é gravado logo após criar (antes de terminar)', async () => {
    const id = criarConteudo();
    let gravado;
    const { pub } = publicador(rotas({
      '/C1': () => {
        gravado = conteudo(id).publicacao_container_id;
        return { status_code: 'FINISHED' };
      },
    }));
    await pub.iniciar(id);
    expect(gravado).toBe('C1');
  });
});

describe('publicador — depois de publicar', () => {
  it('liga o planejado ao post quando a sync traz a mídia', async () => {
    const id = criarConteudo();
    const sincronizar = vi.fn(async () => {
      db.prepare("INSERT INTO instagram_midias (id, tipo, publicado_em, atualizado_em) VALUES ('M1', 'reels', 'x', 'x')").run();
    });
    const { pub } = publicador(rotas(finalizado()), { sincronizar });
    await pub.iniciar(id);
    expect(conteudo(id)).toMatchObject({ estado: 'publicado', midia_id: 'M1' });
  });

  it('sync que falha não desfaz a publicação', async () => {
    const id = criarConteudo();
    const sincronizar = vi.fn(async () => {
      throw new Error('fora do ar');
    });
    const { pub } = publicador(rotas(finalizado()), { sincronizar });
    await pub.iniciar(id);
    expect(conteudo(id)).toMatchObject({ estado: 'publicado', publicacao_midia_id: 'M1', midia_id: null });
  });
});

describe('publicador — retomar', () => {
  it('com contêiner salvo e sem envio: não cria contêiner, só consulta e publica', async () => {
    const id = criarConteudo({ estado: 'publicando', extra: { publicacao_token: 'b'.repeat(48), publicacao_container_id: 'C9' } });
    const { pub, posts, falso } = publicador(rotas(finalizado('C9')));
    await pub.retomar();
    expect(posts().map((r) => r.url.pathname)).toEqual(['/178/media_publish']);
    expect(posts()[0].corpo.creation_id).toBe('C9');
    expect(falso.chamadas.some((u) => u.pathname === '/C9')).toBe(true);
    expect(conteudo(id)).toMatchObject({ estado: 'publicado', publicacao_midia_id: 'M1' });
  });

  it('já enviado: falhou com a mensagem de interrupção e nenhum POST', async () => {
    const id = criarConteudo({
      estado: 'publicando',
      extra: { publicacao_token: 'b'.repeat(48), publicacao_container_id: 'C9', publicacao_enviado_em: '2026-10-19T10:00:00.000Z' },
    });
    const { pub, falso } = publicador();
    await pub.retomar();
    expect(falso.requisicoes.filter((r) => r.metodo === 'POST')).toHaveLength(0);
    expect(conteudo(id)).toMatchObject({ estado: 'falhou', publicacao_erro: MSG_INTERROMPIDA, publicacao_token: null });
  });

  it('ignora conteúdos que não estão publicando', async () => {
    criarConteudo({ estado: 'pronto' });
    const { pub, falso } = publicador();
    await pub.retomar();
    expect(falso.chamadas).toHaveLength(0);
  });
});
