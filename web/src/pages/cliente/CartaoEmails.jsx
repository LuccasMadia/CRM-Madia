import { Link } from 'react-router';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';

const formatarDia = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');

// Últimas conversas de e-mail com o cliente (somente leitura). Um problema aqui nunca derruba a página do cliente.
export function CartaoEmails({ cliente }) {
  const estado = useCarregar(() => api('/gmail'), []);
  const conectado = estado.dados?.conectado;
  const emails = useCarregar(
    () => (conectado && cliente.email ? api(`/clientes/${cliente.id}/emails`) : Promise.resolve(null)),
    [conectado, cliente.id, cliente.email],
  );
  const conversas = emails.dados?.conversas;

  let corpo = null;
  if (estado.erro) corpo = <p className="aviso aviso--erro" role="alert">{estado.erro.message}</p>;
  else if (estado.dados && !conectado) corpo = <p>Conecte o Gmail para ver as conversas com este cliente. <Link to="/configuracoes">Conectar o Gmail</Link></p>;
  else if (conectado && !cliente.email) corpo = <p>Cadastre o e-mail do cliente para ver as conversas.</p>;
  else if (emails.erro) {
    corpo = <p className="aviso aviso--erro" role="alert">{emails.erro.message} <Link to="/configuracoes">Reconectar o Gmail</Link></p>;
  } else if (conversas && !conversas.length) corpo = <p className="vazio">Nenhuma conversa com esse e-mail.</p>;
  else if (conversas) {
    corpo = (
      <ul className="emails">
        {conversas.map((c) => (
          <li key={c.id} className="emails__item">
            <strong>{c.assunto}</strong>
            <span className="vazio">{`${formatarDia(c.data)} · ${c.de}`}</span>
            <p>{c.trecho}</p>
            <a href={c.link} target="_blank" rel="noreferrer">Abrir no Gmail<span className="sr-only"> ({c.assunto})</span></a>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section className="cartao">
      <h2 className="cartao__titulo">E-mails</h2>
      {corpo}
    </section>
  );
}
