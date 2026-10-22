import { dispensar, useNotificacoes } from '../lib/notificacoes.js';
import { Icone } from './Icone.jsx';

export function Notificacoes() {
  const lista = useNotificacoes();
  return (
    <div className="notificacoes" role="status" aria-live="polite">
      {lista.map((n) => (
        <p key={n.id} className="notificacao">
          <Icone nome="check" tamanho={18} />
          <span>{n.texto}</span>
          <button type="button" className="btn btn--icone" aria-label="Dispensar aviso" onClick={() => dispensar(n.id)}>
            <Icone nome="fechar" tamanho={16} />
          </button>
        </p>
      ))}
    </div>
  );
}
