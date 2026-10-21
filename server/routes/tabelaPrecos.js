import { Router } from 'express';
import { repoTabelaServicos, repoTabelaPacotes } from '../repos/orcamentos.js';
import { obterConfig, definirConfig } from '../repos/config.js';
import { emTransacao } from '../repos/crud.js';
import { validar, lerId } from '../http/validar.js';
import { ErroHttp, ErroValidacao, naoEncontrado } from '../http/erros.js';

const CHAVE_GMN = 'preco_servico_google_meu_negocio_centavos';
const CHAVE_DESCONTO = 'orcamento_desconto_combo_pct';
const CHAVE_WHATSAPP = 'contato_whatsapp';
const TIPOS_FIXOS = ['placa', 'gmn_config', 'hospedagem'];

const REGRAS_SERVICO = {
  nome: { tipo: 'texto', obrigatorio: true },
  frase: { tipo: 'texto' },
  valor_unico_centavos: { tipo: 'inteiro', min: 0 },
  valor_mensal_centavos: { tipo: 'inteiro', min: 0 },
  hospedagem: { tipo: 'enum', valores: ['obrigatoria', 'opcional', 'nao_se_aplica'], padrao: 'nao_se_aplica' },
};

const REGRAS_PACOTE = { nome: { tipo: 'texto', obrigatorio: true } };

const REGRAS_ITEM = {
  servico_id: { tipo: 'inteiro', min: 1, obrigatorio: true },
  opcional: { tipo: 'bool' },
  quantidade: { tipo: 'inteiro', min: 1, padrao: 1 },
  placa_modelo_id: { tipo: 'inteiro', min: 1 },
};

const REGRAS_CONFIG = {
  desconto_combo_pct: { tipo: 'inteiro', min: 0, max: 100 },
  contato_whatsapp: { tipo: 'texto' },
};

export function rotasTabelaPrecos({ db }) {
  const r = Router();
  const servicos = repoTabelaServicos(db);
  const pacotes = repoTabelaPacotes(db);

  const precoGmn = () => Number(obterConfig(db, CHAVE_GMN) ?? 0);
  // O preço da configuração do GMN vive na config; a linha da tabela nunca o guarda.
  const comPreco = (s) => (s.tipo === 'gmn_config' ? { ...s, valor_unico_centavos: precoGmn() } : s);

  function itensValidos(corpo) {
    const itens = corpo?.itens;
    if (!Array.isArray(itens)) throw new ErroValidacao([{ campo: 'itens', mensagem: 'Deve ser uma lista' }]);
    return itens.map((item) => {
      const dados = validar(item, REGRAS_ITEM);
      if (!servicos.obter(dados.servico_id)) throw new ErroValidacao([{ campo: 'itens', mensagem: 'Serviço não encontrado' }]);
      if (dados.placa_modelo_id && !db.prepare('SELECT 1 FROM placas_modelos WHERE id = ?').get(dados.placa_modelo_id)) {
        throw new ErroValidacao([{ campo: 'itens', mensagem: 'Modelo de placa não encontrado' }]);
      }
      return dados;
    });
  }

  const pacoteCompleto = (id) => pacotes.listarComItens().find((p) => p.id === id);

  r.get('/', (req, res) => {
    res.json({
      servicos: servicos.listar({}, 'ordem, id').map(comPreco),
      pacotes: pacotes.listarComItens(),
      desconto_combo_pct: Number(obterConfig(db, CHAVE_DESCONTO) ?? 10),
      contato_whatsapp: obterConfig(db, CHAVE_WHATSAPP) || null,
    });
  });

  r.post('/servicos', (req, res) => {
    const dados = validar(req.body, REGRAS_SERVICO);
    const ordem = db.prepare('SELECT COALESCE(MAX(ordem) + 1, 0) AS n FROM tabela_servicos').get().n;
    res.status(201).json(servicos.criar({ ...dados, tipo: 'comum', ordem, ativo: 1 }));
  });

  // Declarada antes de /servicos/:id para "ordem" não ser lida como id.
  r.put('/servicos/ordem', (req, res) => {
    const ids = req.body?.ids;
    const atuais = db.prepare('SELECT id FROM tabela_servicos').all().map((s) => s.id);
    const valido =
      Array.isArray(ids) && ids.length === atuais.length && new Set(ids).size === ids.length && ids.every((id) => atuais.includes(id));
    if (!valido) throw new ErroValidacao([{ campo: 'ids', mensagem: 'A lista deve conter exatamente os serviços atuais' }]);
    const atualizar = db.prepare('UPDATE tabela_servicos SET ordem = ? WHERE id = ?');
    emTransacao(db, () => ids.forEach((id, indice) => atualizar.run(indice, id)));
    res.status(204).end();
  });

  r.put('/servicos/:id', (req, res) => {
    const id = lerId(req.params.id);
    const atual = servicos.obter(id);
    if (!atual) throw naoEncontrado('Serviço');
    const dados = validar(req.body, { ...REGRAS_SERVICO, ativo: { tipo: 'bool' } }, { parcial: true });
    if (atual.tipo === 'placa' || atual.tipo === 'gmn_config') delete dados.valor_mensal_centavos;
    if (atual.tipo === 'placa') delete dados.valor_unico_centavos;
    if (atual.tipo === 'gmn_config' && 'valor_unico_centavos' in dados) {
      definirConfig(db, CHAVE_GMN, String(dados.valor_unico_centavos ?? 0));
      delete dados.valor_unico_centavos;
    }
    res.json(comPreco(servicos.atualizar(id, dados)));
  });

  r.delete('/servicos/:id', (req, res) => {
    const id = lerId(req.params.id);
    const atual = servicos.obter(id);
    if (!atual) throw naoEncontrado('Serviço');
    if (TIPOS_FIXOS.includes(atual.tipo)) {
      throw new ErroHttp(409, 'Este serviço é fixo e não pode ser apagado. Desative em vez de apagar.');
    }
    if (servicos.emUso(id)) throw new ErroHttp(409, 'Este serviço já foi usado. Desative em vez de apagar.');
    servicos.remover(id);
    res.status(204).end();
  });

  r.post('/pacotes', (req, res) => {
    const dados = validar(req.body, REGRAS_PACOTE);
    const itens = itensValidos(req.body);
    const pacote = pacotes.salvar(null, dados, itens);
    res.status(201).json(pacoteCompleto(pacote.id));
  });

  r.put('/pacotes/:id', (req, res) => {
    const id = lerId(req.params.id);
    if (!pacotes.obter(id)) throw naoEncontrado('Pacote');
    const dados = validar(req.body, REGRAS_PACOTE, { parcial: true });
    const itens = 'itens' in (req.body ?? {}) ? itensValidos(req.body) : null;
    pacotes.salvar(id, dados, itens);
    res.json(pacoteCompleto(id));
  });

  r.delete('/pacotes/:id', (req, res) => {
    if (!pacotes.remover(lerId(req.params.id))) throw naoEncontrado('Pacote');
    res.status(204).end();
  });

  r.put('/config', (req, res) => {
    const dados = validar(req.body, REGRAS_CONFIG, { parcial: true });
    if ('desconto_combo_pct' in dados) definirConfig(db, CHAVE_DESCONTO, String(dados.desconto_combo_pct ?? 10));
    if ('contato_whatsapp' in dados) definirConfig(db, CHAVE_WHATSAPP, dados.contato_whatsapp ?? '');
    res.json({
      desconto_combo_pct: Number(obterConfig(db, CHAVE_DESCONTO) ?? 10),
      contato_whatsapp: obterConfig(db, CHAVE_WHATSAPP) || null,
    });
  });

  return r;
}
