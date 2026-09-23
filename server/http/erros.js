export class ErroHttp extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

export class ErroValidacao extends ErroHttp {
  constructor(erros) {
    super(400, 'Dados inválidos');
    this.erros = erros;
  }
}

export const naoEncontrado = (oQue = 'Registro') => new ErroHttp(404, `${oQue} não encontrado`);

// eslint-disable-next-line no-unused-vars
export function tratarErros(erro, req, res, next) {
  if (erro instanceof ErroValidacao) return res.status(400).json({ erros: erro.erros });
  if (erro instanceof ErroHttp) return res.status(erro.status).json({ erro: erro.message });
  if (erro?.name === 'MulterError') {
    const mensagem = erro.code === 'LIMIT_FILE_SIZE' ? 'Imagem maior que 10 MB' : erro.message;
    return res.status(400).json({ erro: mensagem });
  }
  if (erro?.type === 'entity.parse.failed') return res.status(400).json({ erro: 'JSON inválido' });
  console.error(erro);
  return res.status(500).json({ erro: `Erro interno: ${erro.message}` });
}
