import { Router } from 'express';
import { repoClientes } from '../repos/clientes.js';
import { repoProjetos } from '../repos/projetos.js';
import { validar, lerId } from '../http/validar.js';
import { ErroHttp, naoEncontrado } from '../http/erros.js';

export const REGRAS_CLIENTE = {
  nome: { tipo: 'texto', obrigatorio: true },
  empresa: { tipo: 'texto' },
  email: { tipo: 'texto' },
  telefone: { tipo: 'texto' },
  instagram: { tipo: 'texto' },
  origem: { tipo: 'texto' },
  notas: { tipo: 'texto' },
};

export function rotasClientes({ db }) {
  const clientes = repoClientes(db);
  const projetos = repoProjetos(db);
  const r = Router();

  r.get('/', (req, res) => res.json(clientes.buscar(req.query.busca ?? '')));

  r.post('/', (req, res) => res.status(201).json(clientes.criar(validar(req.body, REGRAS_CLIENTE))));

  r.get('/:id', (req, res) => {
    const cliente = clientes.obter(lerId(req.params.id));
    if (!cliente) throw naoEncontrado('Cliente');
    res.json({
      ...cliente,
      projetos: projetos.listarComCliente({ cliente_id: cliente.id }),
      total_faturado_centavos: clientes.totalFaturado(cliente.id),
    });
  });

  r.put('/:id', (req, res) => {
    const cliente = clientes.atualizar(lerId(req.params.id), validar(req.body, REGRAS_CLIENTE, { parcial: true }));
    if (!cliente) throw naoEncontrado('Cliente');
    res.json(cliente);
  });

  r.delete('/:id', (req, res) => {
    const id = lerId(req.params.id);
    if (clientes.contarProjetos(id) > 0) {
      throw new ErroHttp(409, 'Este cliente tem projetos. Exclua ou mova os projetos antes de excluir o cliente.');
    }
    if (!clientes.remover(id)) throw naoEncontrado('Cliente');
    res.status(204).end();
  });

  return r;
}
