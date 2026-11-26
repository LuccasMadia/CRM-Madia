import { Router } from 'express';
import { definirConfig } from '../repos/config.js';
import { repoProjetos } from '../repos/projetos.js';
import { validar, lerId } from '../http/validar.js';
import { ErroHttp, ErroValidacao, naoEncontrado } from '../http/erros.js';
import { criarClienteSupabase, ErroSupabase } from '../supabase/cliente.js';

export function rotasSupabase({ db, fetch, supabase }) {
  const projetos = repoProjetos(db);
  const r = Router();
  const falha = (erro) => (erro instanceof ErroSupabase ? new ErroHttp(502, erro.message) : erro);
  const exigirConexao = () => { if (!supabase.estado().conectado) throw new ErroHttp(409, 'Conecte o Supabase em Configurações.'); };
  const forcar = (req) => req.query.atualizar === '1';

  r.get('/supabase', (req, res) => res.json(supabase.estado()));

  r.put('/supabase/conexao', async (req, res) => {
    const { token } = validar(req.body, { token: { tipo: 'texto', obrigatorio: true } });
    try {
      await criarClienteSupabase({ token, fetch }).listarProjetos();
    } catch (erro) {
      if (erro.tokenInvalido) throw new ErroValidacao([{ campo: 'token', mensagem: 'Token inválido ou sem permissão' }]);
      throw falha(erro);
    }
    definirConfig(db, 'supabase_token', token);
    supabase.limparCache();
    res.json(supabase.estado());
  });

  r.delete('/supabase/conexao', (req, res) => {
    db.prepare("DELETE FROM config WHERE chave = 'supabase_token'").run();
    supabase.limparCache();
    res.json(supabase.estado());
  });

  r.get('/supabase/projetos', async (req, res) => {
    exigirConexao();
    try {
      res.json(await supabase.projetos({ forcar: forcar(req) }));
    } catch (erro) {
      throw falha(erro);
    }
  });

  // Alimenta a faixa "Pede atenção": nunca mostra erro do Supabase.
  r.get('/supabase/atencao', async (req, res) => {
    if (!supabase.estado().conectado) return res.json({ alertas: [] });
    try {
      res.json({ alertas: await supabase.alertas() });
    } catch {
      res.json({ alertas: [] });
    }
  });

  r.get('/projetos/:id/supabase', async (req, res) => {
    const projeto = projetos.obter(lerId(req.params.id));
    if (!projeto) throw naoEncontrado('Projeto');
    exigirConexao();
    try {
      res.json(await supabase.detalheProjeto(projeto, { forcar: forcar(req) }));
    } catch (erro) {
      throw falha(erro);
    }
  });

  return r;
}
