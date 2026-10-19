import { Router } from 'express';
import { repoClientes } from '../repos/clientes.js';
import { repoProjetos } from '../repos/projetos.js';
import { repoPlacasVendas } from '../repos/placas.js';
import { estadoVendaPlaca, valorVendaPlaca } from '../domain/placas.js';
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

export function rotasClientes({ db, hoje }) {
  const clientes = repoClientes(db);
  const projetos = repoProjetos(db);
  const vendasPlacas = repoPlacasVendas(db);
  const r = Router();

  r.get('/', (req, res) => res.json(clientes.buscar(req.query.busca ?? '')));

  r.post('/', (req, res) => {
    const dados = validar(req.body, REGRAS_CLIENTE);
    res.status(201).json(clientes.criar(dados));
  });

  r.get('/:id', (req, res) => {
    const cliente = clientes.obter(lerId(req.params.id));
    if (!cliente) throw naoEncontrado('Cliente');
    res.json({
      ...cliente,
      projetos: projetos.listarComCliente({ cliente_id: cliente.id }),
      total_faturado_centavos: clientes.totalFaturado(cliente.id),
    });
  });

  r.get('/:id/placas', (req, res) => {
    const cliente = clientes.obter(lerId(req.params.id));
    if (!cliente) throw naoEncontrado('Cliente');
    res.json({
      vendas_avulsas: vendasPlacas.listarAvulsasDoCliente(cliente.id),
      vendas: vendasPlacas.listarDoCliente(cliente.id)
        .map((v) => ({ ...v, estado: estadoVendaPlaca(v, hoje()), valor_total_centavos: valorVendaPlaca(v) })),
      ja_comprou: vendasPlacas.quantidadeDoCliente(cliente.id),
    });
  });

  r.put('/:id', (req, res) => {
    const id = lerId(req.params.id);
    const atual = clientes.obter(id);
    if (!atual) throw naoEncontrado('Cliente');
    const dados = validar(req.body, REGRAS_CLIENTE, { parcial: true });
    res.json(clientes.atualizar(id, dados));
  });

  r.delete('/:id', (req, res) => {
    const id = lerId(req.params.id);
    if (clientes.contarProjetos(id) > 0) {
      throw new ErroHttp(409, 'Este cliente tem projetos. Exclua ou mova os projetos antes de excluir o cliente.');
    }
    // QR codes saíram do app; os que sobraram no banco vão junto com o cliente
    if (!clientes.removerComQrcodes(id)) throw naoEncontrado('Cliente');
    res.status(204).end();
  });

  return r;
}
