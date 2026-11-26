import { Router } from 'express';
import { definirConfig } from '../repos/config.js';
import { validar } from '../http/validar.js';
import { ErroHttp, ErroValidacao, naoEncontrado } from '../http/erros.js';
import { dataValida } from '../domain/datas.js';
import { lerContas, salvarContas } from '../supabase/contas.js';

const SERVICOS = ['github', 'figma', 'vercel', 'supabase', 'instagram'];

export function rotasConexoes({ db, conexoes }) {
  const r = Router();

  r.get('/conexoes', async (req, res) => res.json(await conexoes.listar({ forcar: req.query.atualizar === '1' })));

  // Alimenta as faixas de aviso: nunca devolve erro.
  r.get('/conexoes/atencao', async (req, res) => {
    try {
      res.json({ alertas: await conexoes.alertas() });
    } catch {
      res.json({ alertas: [] });
    }
  });

  r.put('/conexoes/validade', async (req, res) => {
    const { servico } = validar(req.body, { servico: { tipo: 'enum', valores: SERVICOS, obrigatorio: true } });
    if (servico === 'instagram') throw new ErroHttp(400, 'O Instagram renova a validade sozinho.');
    const validade = String(req.body.validade ?? '').trim();
    if (validade && !dataValida(validade)) throw new ErroValidacao([{ campo: 'validade', mensagem: 'Informe uma data válida' }]);

    if (servico === 'supabase') {
      const contas = lerContas(db);
      const id = Number(req.body.conta_id);
      if (!contas.some((c) => c.id === id)) throw naoEncontrado('Conta');
      salvarContas(db, contas.map((c) => {
        if (c.id !== id) return c;
        const { validade: _antiga, ...resto } = c;
        return validade ? { ...resto, validade } : resto;
      }));
    } else {
      const chave = `${servico}_token`;
      if (!db.prepare('SELECT 1 FROM config WHERE chave = ?').get(chave)) throw new ErroHttp(409, 'Conecte esse serviço em Configurações.');
      if (validade) definirConfig(db, `${servico}_validade`, validade);
      else db.prepare('DELETE FROM config WHERE chave = ?').run(`${servico}_validade`);
    }
    res.json(await conexoes.listar());
  });

  return r;
}
