import { cloneElement } from 'react';

export function Campo({ rotulo, nome, erros = [], children, ...props }) {
  const erro = erros.find((e) => e.campo === nome)?.mensagem;
  const id = `campo-${nome}`;
  const controle = children
    ? cloneElement(children, { id, 'aria-invalid': Boolean(erro) })
    : <input id={id} aria-invalid={Boolean(erro)} {...props} />;
  return (
    <div className="campo">
      <label htmlFor={id}>{rotulo}</label>
      {controle}
      {erro && <p className="campo__erro" role="alert">{erro}</p>}
    </div>
  );
}
