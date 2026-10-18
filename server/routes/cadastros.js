import { Router } from 'express';
import { repoCategorias, repoNichos } from '../repos/categorias.js';
import { validar, lerId } from '../http/validar.js';
import { ErroHttp, ErroValidacao, naoEncontrado } from '../http/erros.js';

// Rotas iguais para as duas listas: o nome é único sem diferenciar maiúsculas e não se exclui o que está em uso.
function rotasCadastro(repo, regras, registro, { antesDeCriar = (dados) => dados } = {}) {
  const r = Router();

  function exigirNomeLivre(nome, id = null) {
    const existente = repo.idComNome(nome);
    if (existente && existente !== id) throw new ErroValidacao([{ campo: 'nome', mensagem: 'Já existe' }]);
  }

  r.get('/', (req, res) => res.json(repo.listarOrdenadas()));

  r.post('/', (req, res) => {
    const dados = validar(req.body, regras);
    exigirNomeLivre(dados.nome);
    res.status(201).json(repo.criar(antesDeCriar(dados)));
  });

  r.put('/:id', (req, res) => {
    const id = lerId(req.params.id);
    if (!repo.obter(id)) throw naoEncontrado(registro);
    const dados = validar(req.body, regras, { parcial: true });
    if (dados.nome !== undefined) exigirNomeLivre(dados.nome, id);
    res.json(repo.atualizar(id, dados));
  });

  r.delete('/:id', (req, res) => {
    const id = lerId(req.params.id);
    const uso = repo.contarUso(id);
    if (uso > 0) throw new ErroHttp(409, `Em uso por ${uso} projeto(s)`);
    if (!repo.remover(id)) throw naoEncontrado(registro);
    res.status(204).end();
  });

  return r;
}

export function rotasCategorias({ db }) {
  const categorias = repoCategorias(db);
  return rotasCadastro(
    categorias,
    { nome: { tipo: 'texto', obrigatorio: true }, ordem: { tipo: 'inteiro', min: 0 } },
    'Categoria',
    { antesDeCriar: (dados) => ({ ...dados, ordem: dados.ordem ?? categorias.proximaOrdem() }) },
  );
}

export function rotasNichos({ db }) {
  return rotasCadastro(repoNichos(db), { nome: { tipo: 'texto', obrigatorio: true } }, 'Nicho');
}
