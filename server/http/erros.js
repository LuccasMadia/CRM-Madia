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

const MSG_ARQUIVO_GRANDE = 'Arquivo maior que o limite permitido (10 MB para imagens, 300 MB para vídeos).';

function mensagemMulter(erro) {
  if (erro.code === 'LIMIT_FILE_SIZE') return MSG_ARQUIVO_GRANDE;
  // upload.array('midias', 10) dos conteúdos: o 11º arquivo chega como "campo inesperado".
  if (erro.code === 'LIMIT_UNEXPECTED_FILE' && erro.field === 'midias') return 'Envie no máximo 10 mídias por vez.';
  return erro.message;
}

// eslint-disable-next-line no-unused-vars
export function tratarErros(erro, req, res, next) {
  if (erro instanceof ErroValidacao) return res.status(400).json({ erros: erro.erros });
  if (erro instanceof ErroHttp) return res.status(erro.status).json({ erro: erro.message });
  if (erro?.name === 'MulterError') {
    return res.status(400).json({ erro: mensagemMulter(erro) });
  }
  if (erro?.type === 'entity.parse.failed') return res.status(400).json({ erro: 'JSON inválido' });
  console.error(erro);
  return res.status(500).json({ erro: `Erro interno: ${erro.message}` });
}
