import { api } from '../api/client.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { ehPc } from '../lib/ambiente.js';
import { Aviso } from './Aviso.jsx';

const ACCEPT = { reels: 'video/mp4,video/quicktime' };
const ACCEPT_IMAGEM = 'image/png,image/jpeg,image/webp';

// Lista as mídias de um conteúdo já salvo; cada alteração devolve o conteúdo atualizado em `onMudou`.
export function MidiasConteudo({ conteudo, onMudou }) {
  const { erro, enviando, executar } = useEnvio();
  const midias = conteudo.midias ?? [];
  const base = `/conteudos/${conteudo.id}/midias`;

  const mudar = (chamada) => executar(async () => onMudou(await chamada()));
  const mensagem = erro && { message: erro.erros?.[0]?.mensagem ?? erro.message };

  function mover(indice, delta) {
    const ids = midias.map((m) => m.id);
    [ids[indice], ids[indice + delta]] = [ids[indice + delta], ids[indice]];
    mudar(() => api(`${base}/ordem`, { method: 'PUT', body: { ids } }));
  }

  function enviar(e) {
    const arquivos = [...(e.target.files ?? [])];
    e.target.value = '';
    if (arquivos.length === 0) return;
    const corpo = new FormData();
    arquivos.forEach((a) => corpo.append('midias', a));
    mudar(() => api(base, { method: 'POST', body: corpo }));
  }

  return (
    <div className="campo midias">
      <span className="midias__titulo">Mídias</span>
      {midias.length > 0 && (
        <ul className="midias__lista">
          {midias.map((m, i) => (
            <li key={m.id} className="midias__item">
              {m.tipo === 'video'
                ? <video src={m.url} muted preload="metadata" />
                : <img src={m.url} alt={`Mídia ${i + 1}`} />}
              <span className="midias__acoes">
                {i > 0 && (
                  <button type="button" className="btn btn--fantasma" disabled={enviando} aria-label={`Mover para antes: mídia ${i + 1}`} onClick={() => mover(i, -1)}>←</button>
                )}
                {i < midias.length - 1 && (
                  <button type="button" className="btn btn--fantasma" disabled={enviando} aria-label={`Mover para depois: mídia ${i + 1}`} onClick={() => mover(i, 1)}>→</button>
                )}
                <button type="button" className="btn btn--fantasma" disabled={enviando} aria-label={`Remover mídia ${i + 1}`} onClick={() => mudar(() => api(`${base}/${m.id}`, { method: 'DELETE' }))}>×</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {ehPc() ? (
        <>
          <label htmlFor="campo-midias">Adicionar mídias</label>
          <input
            id="campo-midias"
            type="file"
            multiple
            disabled={enviando}
            accept={ACCEPT[conteudo.tipo] ?? ACCEPT_IMAGEM}
            onChange={enviar}
          />
        </>
      ) : (
        <p className="aviso">Suba a mídia pelo PC.</p>
      )}
      <Aviso erro={mensagem} />
    </div>
  );
}
