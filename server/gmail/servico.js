import { randomUUID } from 'node:crypto';
import { obterConfig, definirConfig } from '../repos/config.js';
import { criarCache } from '../github/cache.js';
import { ErroHttp } from '../http/erros.js';
import { criarClienteGoogle, criarClienteGmail } from './cliente.js';

export const REDIRECT_URI = 'http://127.0.0.1:5174/api/gmail/callback';
const CINCO_MINUTOS = 5 * 60 * 1000;
const DEZ_MINUTOS = 10 * 60 * 1000;
const CHAVES = ['gmail_client_id', 'gmail_client_secret', 'gmail_refresh_token', 'gmail_usuario'];

// Tudo que o CRM lê do Gmail passa por aqui. Só leitura; o access token vive só em memória.
export function criarServicoGmail({ db, fetch }) {
  const cache = criarCache(CINCO_MINUTOS);
  const google = criarClienteGoogle({ fetch });
  const estados = new Map(); // state → { expira (ms), retorno }
  let accessToken = null;

  const cfg = (chave) => obterConfig(db, chave);
  const estado = () => ({
    configurado: Boolean(cfg('gmail_client_id') && cfg('gmail_client_secret')),
    conectado: Boolean(cfg('gmail_refresh_token')),
    usuario: cfg('gmail_usuario') ?? null,
  });

  function salvarCredenciais({ client_id, client_secret }) {
    definirConfig(db, 'gmail_client_id', client_id);
    definirConfig(db, 'gmail_client_secret', client_secret);
    // O refresh token pertence ao Client ID antigo: trocar as credenciais exige conectar de novo.
    db.prepare("DELETE FROM config WHERE chave IN ('gmail_refresh_token', 'gmail_usuario')").run();
    accessToken = null;
    cache.limpar();
  }

  // Só volta para o próprio computador (em desenvolvimento a tela fica em outra porta que a da API).
  const retornoLocal = (retorno) => (/^http:\/\/(127\.0\.0\.1|localhost):\d{1,5}$/.test(retorno ?? '') ? retorno : '');

  function iniciar({ retorno } = {}) {
    if (!estado().configurado) throw new ErroHttp(409, 'Informe o Client ID e o Client Secret primeiro.');
    const agora = Date.now();
    for (const [state, pedido] of estados) if (pedido.expira <= agora) estados.delete(state);
    const state = randomUUID();
    estados.set(state, { expira: agora + DEZ_MINUTOS, retorno: retornoLocal(retorno) });
    return google.urlDeAutorizacao({ clientId: cfg('gmail_client_id'), redirectUri: REDIRECT_URI, state });
  }

  async function concluir({ codigo, state }) {
    const pedido = estados.get(state);
    estados.delete(state);
    if (!codigo || !pedido || pedido.expira <= Date.now()) throw new ErroHttp(400, 'Pedido de conexão inválido ou expirado. Conecte de novo em Configurações → Gmail.');
    const dados = await google.trocarCodigo({ clientId: cfg('gmail_client_id'), clientSecret: cfg('gmail_client_secret'), redirectUri: REDIRECT_URI, codigo });
    if (!dados.refresh_token) throw new ErroHttp(502, 'O Google não devolveu a autorização. Remova o acesso em myaccount.google.com/permissions e conecte de novo.');
    const usuario = await criarClienteGmail({ accessToken: dados.access_token, fetch }).usuario();
    definirConfig(db, 'gmail_refresh_token', dados.refresh_token);
    definirConfig(db, 'gmail_usuario', usuario);
    accessToken = dados.access_token;
    cache.limpar();
    return pedido.retorno;
  }

  async function desconectar() {
    const token = cfg('gmail_refresh_token');
    if (token) await google.revogar(token).catch(() => {});
    db.prepare(`DELETE FROM config WHERE chave IN (${CHAVES.map(() => '?').join(',')})`).run(...CHAVES);
    accessToken = null;
    cache.limpar();
  }

  const renovar = async () => {
    accessToken = await google.renovar({ clientId: cfg('gmail_client_id'), clientSecret: cfg('gmail_client_secret'), refreshToken: cfg('gmail_refresh_token') });
    return accessToken;
  };

  async function lerConversas(email) {
    const jaTinha = Boolean(accessToken);
    try {
      return await criarClienteGmail({ accessToken: accessToken ?? await renovar(), fetch }).conversas(email);
    } catch (erro) {
      // Access token que tinha em memória pode ter vencido: renova uma vez e tenta de novo.
      if (!(erro.desconectado && jaTinha)) throw erro;
      return criarClienteGmail({ accessToken: await renovar(), fetch }).conversas(email);
    }
  }

  async function emailsDoCliente(cliente, { forcar = false } = {}) {
    const email = String(cliente.email ?? '').trim();
    if (!email) return { conversas: [], semEmail: true };
    const conversas = await cache.obter(`emails:${email.toLowerCase()}`, () => lerConversas(email), { forcar });
    return { conversas, semEmail: false };
  }

  return { estado, salvarCredenciais, iniciar, concluir, desconectar, emailsDoCliente };
}
