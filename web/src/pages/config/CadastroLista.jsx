import { useState } from 'react';
import { api } from '../../api/client.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { Aviso } from '../../components/Aviso.jsx';

export function CadastroLista({ titulo, caminho, rotuloNovo, ordenavel = false }) {
  const { dados: itens, erro, recarregar } = useCarregar(() => api(caminho), [caminho]);
  const [novo, setNovo] = useState('');
  const [editando, setEditando] = useState(null);
  const [nomeEditado, setNomeEditado] = useState('');
  const envio = useEnvio();
  const erroNome = envio.erros.find((e) => e.campo === 'nome')?.mensagem;

  function adicionar(e) {
    e.preventDefault();
    envio.executar(async () => {
      await api(caminho, { method: 'POST', body: { nome: novo } });
      setNovo('');
      recarregar();
    });
  }

  function salvarNome(e) {
    e.preventDefault();
    envio.executar(async () => {
      await api(`${caminho}/${editando}`, { method: 'PUT', body: { nome: nomeEditado } });
      setEditando(null);
      recarregar();
    });
  }

  function excluir(item) {
    if (!window.confirm(`Excluir "${item.nome}"?`)) return;
    envio.executar(async () => {
      await api(`${caminho}/${item.id}`, { method: 'DELETE' });
      recarregar();
    });
  }

  function trocar(i, j) {
    const a = itens[i];
    const b = itens[j];
    envio.executar(async () => {
      await api(`${caminho}/${a.id}`, { method: 'PUT', body: { ordem: b.ordem } });
      await api(`${caminho}/${b.id}`, { method: 'PUT', body: { ordem: a.ordem } });
      recarregar();
    });
  }

  return (
    <section className="cartao">
      <h2>{titulo}</h2>
      <Aviso erro={erro} />
      <ul className="lista lista-cadastro">
        {(itens ?? []).map((item, i) => (
          <li key={item.id}>
            {editando === item.id ? (
              <form onSubmit={salvarNome} className="form--linha">
                <input aria-label={`Novo nome de ${item.nome}`} value={nomeEditado} onChange={(e) => setNomeEditado(e.target.value)} />
                <button className="btn btn--primario btn--pequeno">Salvar</button>
                <button type="button" className="btn btn--pequeno" onClick={() => setEditando(null)}>Cancelar</button>
              </form>
            ) : (
              <>
                <span className="lista-cadastro__nome">{item.nome}</span>
                {ordenavel && i > 0 && (
                  <button type="button" className="btn btn--pequeno" aria-label={`Subir ${item.nome}`} onClick={() => trocar(i, i - 1)}>↑</button>
                )}
                {ordenavel && i < itens.length - 1 && (
                  <button type="button" className="btn btn--pequeno" aria-label={`Descer ${item.nome}`} onClick={() => trocar(i, i + 1)}>↓</button>
                )}
                <button type="button" className="btn btn--pequeno" aria-label={`Renomear ${item.nome}`} onClick={() => { setEditando(item.id); setNomeEditado(item.nome); }}>Renomear</button>
                <button type="button" className="btn btn--pequeno btn--perigo" aria-label={`Excluir ${item.nome}`} onClick={() => excluir(item)}>Excluir</button>
              </>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={adicionar} className="form--linha">
        <div className="campo">
          <label htmlFor={`novo-${caminho}`}>{rotuloNovo}</label>
          <input id={`novo-${caminho}`} value={novo} aria-invalid={Boolean(erroNome)} onChange={(e) => setNovo(e.target.value)} />
          {erroNome && <p className="campo__erro" role="alert">{erroNome}</p>}
        </div>
        <button className="btn" disabled={envio.enviando}>Adicionar</button>
      </form>
      {!erroNome && <Aviso erro={envio.erro} />}
    </section>
  );
}
