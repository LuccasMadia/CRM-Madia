export function Aviso({ erro }) {
  if (!erro) return null;
  return <p className="aviso aviso--erro" role="alert">{erro.message}</p>;
}
