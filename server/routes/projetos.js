import { Router } from 'express';
import { repoClientes } from '../repos/clientes.js';
import { repoProjetos } from '../repos/projetos.js';
import { emTransacao } from '../repos/crud.js';
import { validar, lerId } from '../http/validar.js';
import { ErroValidacao, naoEncontrado } from '../http/erros.js';
import { ETAPAS, aplicarRegrasProjeto } from '../domain/regras.js';
import { REGRAS_CLIENTE } from './clientes.js';

const REGRAS_PROJETO = {
  cliente_id: { tipo: 'inteiro', obrigatorio: true },
  titulo: { tipo: 'texto', obrigatorio: true },
  descricao: { tipo: 'texto' },
  etapa: { tipo: 'enum', valores: ETAPAS, padrao: 'contato' },
  valor_total_centavos: { tipo: 'inteiro', min: 0, padrao: 0 },
  data_inicio: { tipo: 'data' },
  prazo_entrega: { tipo: 'data' },
  data_entrega: { tipo: 'data' },
  notas: { tipo: 'texto' },
};

export function rotasProjetos({ db, hoje }) {
  const clientes = repoClientes(db);
  const projetos = repoProjetos(db);
  const r = Router();

  function exigirCliente(clienteId) {
    if (!clientes.obter(clienteId)) {
      throw new ErroValidacao([{ campo: 'cliente_id', mensagem: 'Cliente não encontrado' }]);
    }
  }

  r.get('/', (req, res) => {
    res.json(projetos.listarComCliente({ etapa: req.query.etapa, cliente_id: req.query.cliente_id }));
  });

  r.post('/', (req, res) => {
    const corpo = req.body ?? {};
    if (corpo.novo_cliente) {
      let dadosCliente;
      try {
        dadosCliente = validar(corpo.novo_cliente, REGRAS_CLIENTE);
      } catch (erro) {
        if (!(erro instanceof ErroValidacao)) throw erro;
        throw new ErroValidacao(erro.erros.map((e) => ({ ...e, campo: `novo_cliente.${e.campo}` })));
      }
      const { cliente_id: _ignorado, ...regrasSemCliente } = REGRAS_PROJETO;
      const dados = aplicarRegrasProjeto(null, validar(corpo, regrasSemCliente), hoje());
      const criado = emTransacao(db, () => {
        const cliente = clientes.criar(dadosCliente);
        return projetos.criar({ ...dados, cliente_id: cliente.id });
      });
      return res.status(201).json(projetos.obterComCliente(criado.id));
    }
    const dados = aplicarRegrasProjeto(null, validar(corpo, REGRAS_PROJETO), hoje());
    exigirCliente(dados.cliente_id);
    const criado = projetos.criar(dados);
    res.status(201).json(projetos.obterComCliente(criado.id));
  });

  r.get('/:id', (req, res) => {
    const projeto = projetos.obterComCliente(lerId(req.params.id));
    if (!projeto) throw naoEncontrado('Projeto');
    res.json(projeto);
  });

  r.put('/:id', (req, res) => {
    const id = lerId(req.params.id);
    const atual = projetos.obter(id);
    if (!atual) throw naoEncontrado('Projeto');
    const dados = aplicarRegrasProjeto(atual, validar(req.body, REGRAS_PROJETO, { parcial: true }), hoje());
    if (dados.cliente_id !== undefined) exigirCliente(dados.cliente_id);
    projetos.atualizar(id, dados);
    res.json(projetos.obterComCliente(id));
  });

  r.delete('/:id', (req, res) => {
    if (!projetos.remover(lerId(req.params.id))) throw naoEncontrado('Projeto');
    res.status(204).end();
  });

  return r;
}
