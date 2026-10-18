import { useState } from 'react';
import { api } from '../api/client.js';
import { useCarregar } from '../hooks/useCarregar.js';
import { useEnvio } from '../hooks/useEnvio.js';

export function SeletorNicho({ valor, onChange }) {
  const { dados: nichos, recarregar } = useCarregar(() => api('/nichos'), []);
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState('');
  const envio = useEnvio();
  const erroNome = envio.erros.find((e) => e.campo === 'nome')?.mensagem ?? envio.erro?.message;

  function escolher(e) {
    if (e.target.value === 'novo') {
      setCriando(true);
      return;
    }
    setCriando(false);
    onChange(e.target.value);
  }

  function adicionar() {
    envio.executar(async () => {
      const criado = await api('/nichos', { method: 'POST', body: { nome } });
      recarregar();
      setCriando(false);
      setNome('');
      onChange(String(criado.id));
    });
  }

  return (
    <div className="campo">
      <label htmlFor="campo-nicho_id">Nicho</label>
      <select id="campo-nicho_id" value={criando ? 'novo' : valor} onChange={escolher}>
        <option value="">Sem nicho</option>
        {(nichos ?? []).map((n) => <option key={n.id} value={n.id}>{n.nome}</option>)}
        <option value="novo">+ novo nicho…</option>
      </select>
      {criando && (
        <div className="form--linha">
          <input aria-label="Nome do novo nicho" value={nome} onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionar(); } }} />
          <button type="button" className="btn btn--pequeno" disabled={envio.enviando} onClick={adicionar}>Adicionar</button>
        </div>
      )}
      {criando && erroNome && <p className="campo__erro" role="alert">{erroNome}</p>}
    </div>
  );
}
