import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { repoEventos } from '../repos/eventos.js';
import { repoClientes } from '../repos/clientes.js';
import { repoProjetos } from '../repos/projetos.js';
import { validar, lerId } from '../http/validar.js';
import { ErroHttp, ErroValidacao, naoEncontrado } from '../http/erros.js';
import { dataValida } from '../domain/datas.js';
import { lerCalendarios } from '../calendario/calendarios.js';

const REGRAS = {
  titulo: { tipo: 'texto', obrigatorio: true },
  dia_inteiro: { tipo: 'bool' },
  local: { tipo: 'texto' },
  notas: { tipo: 'texto' },
  cliente_id: { tipo: 'inteiro', min: 1 },
  projeto_id: { tipo: 'inteiro', min: 1 },
  calendario_href: { tipo: 'texto' },
};

const invalido = (campo, mensagem) => new ErroValidacao([{ campo, mensagem }]);

// AAAA-MM-DD ou AAAA-MM-DDTHH:MM, com data e hora que existem.
function momentoValido(texto) {
  if (typeof texto !== 'string') return false;
  const m = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(texto);
  if (!m || !dataValida(m[1])) return false;
  return m[2] === undefined || (Number(m[2]) < 24 && Number(m[3]) < 60);
}
const comoMinuto = (texto) => (texto.length === 10 ? `${texto}T00:00` : texto);

export function rotasEventos({ db, calendario }) {
  const eventos = repoEventos(db);
  const clientes = repoClientes(db);
  const projetos = repoProjetos(db);
  const r = Router();

  function exigir(id) {
    const evento = eventos.obter(lerId(id));
    if (!evento || evento.apagado) throw naoEncontrado('Evento');
    return evento;
  }
  const somenteLeitura = (evento) => {
    if (evento.recorrente) throw new ErroHttp(409, 'Evento recorrente é somente leitura.');
  };

  // Valida os campos e o par início/fim; `atual` completa o que a edição não mandou.
  function ler(corpo, atual = null) {
    const parcial = Boolean(atual);
    const erros = [];
    let dados = {};
    try {
      dados = validar(corpo, REGRAS, { parcial });
    } catch (erro) {
      if (!(erro instanceof ErroValidacao)) throw erro;
      erros.push(...erro.erros);
    }
    const momento = (campo, obrigatorio) => {
      if (!(campo in (corpo ?? {}))) { if (!parcial && obrigatorio) erros.push({ campo, mensagem: 'Obrigatório' }); return; }
      const valor = corpo[campo];
      if (valor === null || valor === '') {
        if (obrigatorio) erros.push({ campo, mensagem: 'Obrigatório' });
        else dados[campo] = null;
      } else if (!momentoValido(valor)) erros.push({ campo, mensagem: 'Data inválida (use AAAA-MM-DD ou AAAA-MM-DDTHH:MM)' });
      else dados[campo] = valor;
    };
    momento('inicio', true);
    momento('fim', false);
    if (erros.length) throw new ErroValidacao(erros);

    const inicio = dados.inicio ?? atual?.inicio;
    const fim = 'fim' in dados ? dados.fim : atual?.fim;
    if (inicio && fim && comoMinuto(fim) < comoMinuto(inicio)) throw invalido('fim', 'O fim não pode ser antes do início');
    const diaInteiro = 'dia_inteiro' in dados ? dados.dia_inteiro : atual?.dia_inteiro;
    if (diaInteiro) {
      if ('inicio' in dados) dados.inicio = dados.inicio.slice(0, 10);
      if (dados.fim) dados.fim = dados.fim.slice(0, 10);
    }
    if (dados.cliente_id && !clientes.obter(dados.cliente_id)) throw invalido('cliente_id', 'Cliente não encontrado');
    if (dados.projeto_id && !projetos.obter(dados.projeto_id)) throw invalido('projeto_id', 'Projeto não encontrado');
    if (atual) delete dados.calendario_href; // o evento fica no calendário onde nasceu
    else if (dados.calendario_href && !lerCalendarios(db).some((c) => c.href === dados.calendario_href)) throw invalido('calendario_href', 'Calendário não encontrado');
    return dados;
  }

  r.get('/eventos', (req, res) => {
    const { de, ate } = req.query;
    for (const [campo, valor] of [['de', de], ['ate', ate]]) {
      if (valor !== undefined && !dataValida(valor)) throw invalido(campo, 'Data inválida (use AAAA-MM-DD)');
    }
    res.json(eventos.listar({ de, ate }));
  });

  r.post('/eventos', async (req, res) => {
    const dados = ler(req.body);
    const criado = eventos.criar({ ...dados, uid: `${randomUUID()}@crm-madia` });
    res.status(201).json(await (calendario?.aposGravar?.(criado.id) ?? criado));
  });

  r.put('/eventos/:id', async (req, res) => {
    const atual = exigir(req.params.id);
    somenteLeitura(atual);
    const atualizado = eventos.atualizar(atual.id, ler(req.body, atual));
    res.json(await (calendario?.aposGravar?.(atualizado.id) ?? atualizado));
  });

  r.delete('/eventos/:id', async (req, res) => {
    const atual = exigir(req.params.id);
    somenteLeitura(atual);
    // Só existe lá fora se já tem href: nesse caso o sync apaga no iCloud; senão sai de vez.
    if (atual.href) {
      eventos.marcarApagado(atual.id);
      await calendario?.aposApagar?.(atual.id);
    } else {
      eventos.apagarDefinitivo(atual.id);
    }
    res.status(204).end();
  });

  return r;
}
