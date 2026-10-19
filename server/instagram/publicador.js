import { randomBytes } from 'node:crypto';
import { ErroHttp, ErroValidacao } from '../http/erros.js';
import { obterConfig } from '../repos/config.js';
import { repoConteudoMidias } from '../repos/conteudoMidias.js';
import { criarClienteInstagram } from './cliente.js';
import { validarParaPublicar } from './regrasPublicacao.js';
import { vincular } from './vinculo.js';

const MSG_OCUPADO = 'Este post já está sendo publicado.';
const MSG_SEM_TOKEN = 'O Instagram não está conectado. Conecte em Configurações → Instagram.';
const MSG_DEMOROU = 'O Instagram demorou demais para processar o vídeo. Tente de novo.';
const MSG_INTERROMPIDA =
  'A publicação foi interrompida depois de enviada. Confira no Instagram se o post saiu antes de tentar de novo.';

export function criarPublicador({
  db,
  fetch = globalThis.fetch,
  urlPublica,
  sincronizar = async () => {},
  esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  intervaloMs = 5000,
  limiteMs = 15 * 60 * 1000,
  agora = () => Date.now(),
  log = (erro) => console.error('[publicador]', erro),
}) {
  const midias = repoConteudoMidias(db);
  const carimbo = () => new Date(agora()).toISOString();
  const buscar = (id) => db.prepare('SELECT * FROM conteudos WHERE id = ?').get(id);
  const atualizar = (id, campos) => {
    const colunas = Object.keys(campos);
    const sets = [...colunas.map((c) => `${c} = ?`), 'atualizado_em = ?'].join(', ');
    db.prepare(`UPDATE conteudos SET ${sets} WHERE id = ?`).run(...colunas.map((c) => campos[c]), carimbo(), id);
  };

  // O token sai junto com o estado: a URL pública só funciona durante a publicação.
  const falhar = (id, mensagem) =>
    atualizar(id, { estado: 'falhou', publicacao_erro: mensagem, publicacao_container_id: null, publicacao_token: null });

  // Trava síncrona; o UPDATE condicional é quem decide se outra publicação já está em curso.
  // Devolve a promessa do processamento para quem quiser aguardar (a rota ignora).
  function iniciar(conteudoId) {
    const conteudo = buscar(conteudoId);
    if (!conteudo) throw new ErroHttp(404, 'Conteúdo não encontrado');
    if (conteudo.estado === 'publicando' || conteudo.estado === 'publicado') throw new ErroHttp(409, MSG_OCUPADO);
    const erros = validarParaPublicar(conteudo, midias.listar(conteudoId));
    if (erros.length) throw new ErroValidacao(erros.map((mensagem) => ({ campo: 'publicacao', mensagem })));

    const { changes } = db
      .prepare(`UPDATE conteudos SET estado = 'publicando', publicacao_token = ?, publicacao_erro = NULL,
          publicacao_enviado_em = NULL, atualizado_em = ?
        WHERE id = ? AND estado IN ('rascunho', 'pronto', 'agendado', 'falhou', 'atrasado')`)
      .run(randomBytes(24).toString('hex'), carimbo(), conteudoId);
    if (changes !== 1) throw new ErroHttp(409, MSG_OCUPADO);

    const promessa = processar(conteudoId).catch(log);
    return promessa;
  }

  // Nunca lança: qualquer problema termina em estado 'falhou' com a mensagem para o usuário.
  async function processar(conteudoId) {
    const conteudo = buscar(conteudoId);
    if (!conteudo || conteudo.estado !== 'publicando') return;
    const token = obterConfig(db, 'instagram_token');
    if (!token) return falhar(conteudoId, MSG_SEM_TOKEN);

    let mediaId;
    try {
      const ig = criarClienteInstagram({ token, fetch });
      const { id: usuarioId } = await ig.perfil();
      const containerId = conteudo.publicacao_container_id ?? (await criarConteineres(ig, usuarioId, conteudo));
      await aguardarProcessamento(ig, containerId);
      atualizar(conteudoId, { publicacao_enviado_em: carimbo() });
      mediaId = await ig.publicarContainer(usuarioId, containerId);
      atualizar(conteudoId, { estado: 'publicado', publicacao_midia_id: mediaId, publicacao_token: null });
    } catch (erro) {
      try {
        falhar(conteudoId, erro?.message || 'Erro desconhecido ao publicar.');
      } catch (erroBanco) {
        log(erroBanco);
      }
      return;
    }
    await ligarAoPost(conteudoId, mediaId);
  }

  // Grava o id do contêiner final assim que ele existe, para a retomada não criar outro.
  async function criarConteineres(ig, usuarioId, conteudo) {
    const url = (arquivo) => `${urlPublica}/publico/midia/${conteudo.publicacao_token}/${encodeURIComponent(arquivo)}`;
    const lista = midias.listar(conteudo.id);
    const caption = conteudo.legenda ?? '';
    let containerId;
    if (conteudo.tipo === 'reels') {
      containerId = await ig.criarContainer(usuarioId, { media_type: 'REELS', video_url: url(lista[0].arquivo), caption });
    } else if (conteudo.tipo === 'carrossel') {
      const filhos = [];
      for (const midia of lista) {
        filhos.push(await ig.criarContainer(usuarioId, { image_url: url(midia.arquivo), is_carousel_item: 'true' }));
      }
      containerId = await ig.criarContainer(usuarioId, { media_type: 'CAROUSEL', children: filhos.join(','), caption });
    } else {
      containerId = await ig.criarContainer(usuarioId, { image_url: url(lista[0].arquivo), caption });
    }
    atualizar(conteudo.id, { publicacao_container_id: containerId });
    return containerId;
  }

  async function aguardarProcessamento(ig, containerId) {
    const inicio = agora();
    for (;;) {
      const { status, mensagem } = await ig.statusContainer(containerId);
      if (status === 'FINISHED') return;
      if (status === 'ERROR' || status === 'EXPIRED') throw new Error(`O Instagram recusou a mídia: ${mensagem || status}`);
      if (agora() - inicio >= limiteMs) throw new Error(MSG_DEMOROU);
      await esperar(intervaloMs);
    }
  }

  // Depois de publicado, nada aqui pode voltar o post para 'falhou'.
  async function ligarAoPost(conteudoId, mediaId) {
    await Promise.resolve()
      .then(() => sincronizar())
      .catch(() => {});
    try {
      if (db.prepare('SELECT 1 FROM instagram_midias WHERE id = ?').get(mediaId)) {
        const { midia_id: atual } = buscar(conteudoId);
        if (!atual) vincular(db, conteudoId, mediaId);
      }
    } catch (erro) {
      log(erro);
    }
  }

  // Ao subir o servidor: o que ficou em 'publicando' foi interrompido no meio.
  // Se já tinha mandado publicar, não dá para saber se o post saiu; não repete.
  function retomar() {
    const pendentes = db.prepare("SELECT id, publicacao_enviado_em FROM conteudos WHERE estado = 'publicando'").all();
    const promessas = [];
    for (const { id, publicacao_enviado_em: enviadoEm } of pendentes) {
      if (enviadoEm) falhar(id, MSG_INTERROMPIDA);
      else promessas.push(processar(id).catch(log));
    }
    return Promise.all(promessas).then(() => {});
  }

  return { iniciar, processar, retomar };
}
