import { Router } from 'express';
import { repoProjetos } from '../repos/projetos.js';
import { validar, lerId } from '../http/validar.js';
import { ErroHttp, ErroValidacao, naoEncontrado } from '../http/erros.js';
import { criarClienteSupabase, ErroSupabase } from '../supabase/cliente.js';
import { lerContas, salvarContas } from '../supabase/contas.js';

export function rotasSupabase({ db, fetch, supabase }) {
  const projetos = repoProjetos(db);
  const r = Router();
  const falha = (erro) => (erro instanceof ErroSupabase ? new ErroHttp(502, erro.message) : erro);
  const exigirConexao = () => { if (!supabase.estado().conectado) throw new ErroHttp(409, 'Conecte o Supabase em Configurações.'); };
  const forcar = (req) => req.query.atualizar === '1';

  r.get('/supabase', (req, res) => res.json(supabase.estado()));

  r.post('/supabase/contas', async (req, res) => {
    const { nome, token } = validar(req.body, { nome: { tipo: 'texto', obrigatorio: true }, token: { tipo: 'texto', obrigatorio: true } });
    const contas = lerContas(db);
    if (contas.some((c) => c.nome.toLowerCase() === nome.trim().toLowerCase())) {
      throw new ErroValidacao([{ campo: 'nome', mensagem: 'Já existe uma conta com esse nome' }]);
    }
    try {
      await criarClienteSupabase({ token, fetch }).listarProjetos();
    } catch (erro) {
      if (erro.tokenInvalido) throw new ErroValidacao([{ campo: 'token', mensagem: 'Token inválido ou sem permissão' }]);
      throw falha(erro);
    }
    const id = contas.reduce((maior, c) => Math.max(maior, c.id), 0) + 1;
    salvarContas(db, [...contas, { id, nome: nome.trim(), token }]);
    supabase.limparCache();
    res.status(201).json(supabase.estado());
  });

  r.delete('/supabase/contas/:id', (req, res) => {
    const id = lerId(req.params.id);
    const contas = lerContas(db);
    if (!contas.some((c) => c.id === id)) throw naoEncontrado('Conta');
    salvarContas(db, contas.filter((c) => c.id !== id));
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
