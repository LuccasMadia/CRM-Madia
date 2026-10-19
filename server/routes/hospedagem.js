import { Router } from 'express';
import { obterConfig, definirConfig } from '../repos/config.js';
import { repoProjetos } from '../repos/projetos.js';
import { repoParcelas } from '../repos/parcelas.js';
import { repoHospedagens } from '../repos/hospedagens.js';
import { emTransacao } from '../repos/crud.js';
import { gerarTodasMensalidades } from '../repos/mensalidades.js';
import { validar, lerId } from '../http/validar.js';
import { ErroHttp, ErroValidacao, naoEncontrado } from '../http/erros.js';
import { criarClienteVercel, ErroVercel } from '../hospedagem/vercel.js';
import { situacaoCobranca, PRAZO_PADRAO_DIAS } from '../hospedagem/cobranca.js';

const MSG_SEM_TOKEN = 'Conecte a Vercel em Configurações.';
const FASES_COM_ATRASO = ['atrasada', 'avisado', 'prazo_vencido', 'pausado_atrasado'];

// Aceita "site.com.br" (prefixa https://) e devolve a URL normalizada, ou null se não for um endereço.
function normalizarUrl(texto) {
  const bruto = /^[a-z][a-z0-9+.-]*:\/\//i.test(texto) ? texto : `https://${texto}`;
  try {
    const u = new URL(bruto);
    if (!['http:', 'https:'].includes(u.protocol) || !u.hostname.includes('.')) return null;
    return u.href.replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function rotasHospedagem({ db, hoje, fetch }) {
  const projetos = repoProjetos(db);
  const parcelas = repoParcelas(db);
  const hospedagens = repoHospedagens(db);
  const r = Router();

  const prazoDias = () => Number(obterConfig(db, 'corte_prazo_dias')) || PRAZO_PADRAO_DIAS;
  const estado = () => ({ conectado: Boolean(obterConfig(db, 'vercel_token')), prazo_dias: prazoDias() });
  const disparar = (req) => req.app.locals.monitorSites?.checarTodos().catch(() => {});

  function clienteVercel() {
    const token = obterConfig(db, 'vercel_token');
    if (!token) throw new ErroHttp(409, MSG_SEM_TOKEN);
    return criarClienteVercel({ token, fetch });
  }
  const falhaVercel = (erro) => (erro instanceof ErroVercel ? new ErroHttp(502, erro.message) : erro);

  function obterProjeto(valor) {
    const projeto = projetos.obterComCliente(lerId(valor));
    if (!projeto) throw naoEncontrado('Projeto');
    if (projeto.servico !== 'site_sistema') throw new ErroHttp(400, 'Só sites e sistemas têm hospedagem.');
    return projeto;
  }
  const cobrancaDe = (projeto, hospedagem) =>
    situacaoCobranca({
      projeto,
      hospedagem,
      parcelas: parcelas.listar({ projeto_id: projeto.id }),
      hoje: hoje(),
      prazoDias: prazoDias(),
    });
  const formato = (projeto) => {
    const hospedagem = hospedagens.obter(projeto.id);
    return { hospedagem, pausas: hospedagens.listarPausas(projeto.id), cobranca: cobrancaDe(projeto, hospedagem) };
  };

  r.get('/vercel/estado', (req, res) => res.json(estado()));

  r.put('/vercel/conexao', async (req, res) => {
    const { token } = validar(req.body, { token: { tipo: 'texto', obrigatorio: true } });
    try {
      await criarClienteVercel({ token, fetch }).listarProjetos();
    } catch (erro) {
      if (erro.tokenInvalido) throw new ErroValidacao([{ campo: 'token', mensagem: 'Token inválido ou sem permissão' }]);
      throw falhaVercel(erro);
    }
    definirConfig(db, 'vercel_token', token);
    res.json(estado());
  });

  r.delete('/vercel/conexao', (req, res) => {
    db.prepare("DELETE FROM config WHERE chave = 'vercel_token'").run();
    res.status(204).end();
  });

  r.put('/vercel/prazo', (req, res) => {
    const { dias } = validar(req.body, { dias: { tipo: 'inteiro', obrigatorio: true, min: 1, max: 60 } });
    definirConfig(db, 'corte_prazo_dias', String(dias));
    res.json(estado());
  });

  r.get('/vercel/projetos', async (req, res) => {
    const cliente = clienteVercel();
    try {
      res.json(await cliente.listarProjetos());
    } catch (erro) {
      throw falhaVercel(erro);
    }
  });

  r.get('/projetos/:id/hospedagem', (req, res) => {
    res.json(formato(obterProjeto(req.params.id)));
  });

  r.put('/projetos/:id/hospedagem', (req, res) => {
    const projeto = obterProjeto(req.params.id);
    const dados = validar(req.body, {
      tipo: { tipo: 'enum', valores: ['vercel', 'sem_hospedagem'], obrigatorio: true },
      url: { tipo: 'texto' },
      vercel_projeto_id: { tipo: 'texto' },
      vercel_projeto_nome: { tipo: 'texto' },
    });
    if (dados.tipo === 'sem_hospedagem') {
      hospedagens.salvarCadastro(projeto.id, { tipo: 'sem_hospedagem', url: null, vercel_projeto_id: null, vercel_projeto_nome: null });
    } else {
      if (!dados.url) throw new ErroValidacao([{ campo: 'url', mensagem: 'Obrigatório' }]);
      const url = normalizarUrl(dados.url);
      if (!url) throw new ErroValidacao([{ campo: 'url', mensagem: 'Endereço inválido' }]);
      const urlAnterior = hospedagens.obter(projeto.id)?.url ?? null;
      hospedagens.salvarCadastro(projeto.id, { ...dados, url });
      if (url !== urlAnterior) disparar(req);
    }
    res.json(formato(projeto));
  });

  r.post('/projetos/:id/hospedagem/avisei', (req, res) => {
    const projeto = obterProjeto(req.params.id);
    const hospedagem = hospedagens.obter(projeto.id);
    const situacao = cobrancaDe(projeto, hospedagem);
    if (!['atrasada', 'avisado', 'prazo_vencido'].includes(situacao?.fase)) throw new ErroHttp(409, 'Não há mensalidade atrasada.');
    hospedagens.atualizar(projeto.id, { cliente_avisado_em: hoje() });
    res.json(formato(projeto));
  });

  // Valida os 409 comuns de pausar/religar e devolve { hospedagem, cliente }.
  function prepararCorte(projeto) {
    const hospedagem = hospedagens.obter(projeto.id);
    if (hospedagem?.tipo !== 'vercel' || !hospedagem.vercel_projeto_id) {
      throw new ErroHttp(409, 'Escolha o projeto da Vercel na aba Hospedagem.');
    }
    return { hospedagem, cliente: clienteVercel() };
  }

  r.post('/projetos/:id/hospedagem/pausar', async (req, res) => {
    const projeto = obterProjeto(req.params.id);
    if (projeto.ficticio) throw new ErroHttp(409, 'Site fictício não tem corte.');
    const { hospedagem, cliente } = prepararCorte(projeto);
    if (hospedagem.status === 'pausado') throw new ErroHttp(409, 'O site já está fora do ar.');
    try {
      await cliente.pausar(hospedagem.vercel_projeto_id);
    } catch (erro) {
      throw falhaVercel(erro);
    }
    const agora = new Date().toISOString();
    emTransacao(db, () => {
      hospedagens.atualizar(projeto.id, { status: 'pausado', status_desde: agora, falhas_seguidas: 0 });
      hospedagens.registrarPausa(projeto.id, 'pausou', agora);
    });
    res.json(formato(projeto));
  });

  r.post('/projetos/:id/hospedagem/religar', async (req, res) => {
    const projeto = obterProjeto(req.params.id);
    const { hospedagem, cliente } = prepararCorte(projeto);
    if (hospedagem.status !== 'pausado') throw new ErroHttp(409, 'O site não está pausado.');
    try {
      await cliente.religar(hospedagem.vercel_projeto_id);
    } catch (erro) {
      throw falhaVercel(erro);
    }
    emTransacao(db, () => {
      hospedagens.atualizar(projeto.id, { status: 'desconhecido', status_desde: null, falhas_seguidas: 0 });
      hospedagens.registrarPausa(projeto.id, 'religou', new Date().toISOString());
    });
    disparar(req);
    res.json(formato(projeto));
  });

  r.get('/hospedagem/avisos', (req, res) => {
    gerarTodasMensalidades(db, hoje());
    const fora_do_ar = [];
    const cobrancas = [];
    for (const h of hospedagens.listarTodas()) {
      const projeto = projetos.obterComCliente(h.projeto_id);
      if (!projeto) continue;
      if (h.status === 'fora_do_ar') {
        fora_do_ar.push({
          projeto_id: projeto.id,
          titulo: projeto.titulo,
          cliente_nome: projeto.cliente_nome,
          url: h.url,
          desde: h.status_desde,
          motivo: h.ultimo_motivo,
        });
      }
      let situacao = cobrancaDe(projeto, h);
      // O pagamento é marcado na rota de parcelas (que não conhece hospedagem): sem atraso, o "avisei" perde a validade.
      if (h.cliente_avisado_em && !FASES_COM_ATRASO.includes(situacao?.fase)) {
        hospedagens.atualizar(projeto.id, { cliente_avisado_em: null });
        situacao = cobrancaDe(projeto, hospedagens.obter(projeto.id));
      }
      if (situacao) cobrancas.push({ projeto_id: projeto.id, titulo: projeto.titulo, cliente_nome: projeto.cliente_nome, url: h.url, ...situacao });
    }
    res.json({ fora_do_ar, cobrancas });
  });

  r.get('/hospedagem/status', (req, res) => {
    res.json(hospedagens.listarTodas().map((h) => ({ projeto_id: h.projeto_id, tipo: h.tipo, status: h.status, status_desde: h.status_desde })));
  });

  return r;
}
