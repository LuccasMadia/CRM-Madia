import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../api/client.js';
import { useEnvio } from '../hooks/useEnvio.js';
import { Aviso } from '../components/Aviso.jsx';
import { FormQRCode } from '../components/FormQRCode.jsx';

export function QRCodeDetalhe() {
  const { id } = useParams();
  const navegar = useNavigate();
  const [qrcode, setQrcode] = useState(null);
  const [erroCarga, setErroCarga] = useState(null);
  const exclusao = useEnvio();
  const imagem = useEnvio();

  useEffect(() => {
    api(`/qrcodes/${id}`).then(setQrcode, setErroCarga);
  }, [id]);

  if (erroCarga) return <Aviso erro={erroCarga} />;
  if (!qrcode) return <p>Carregando…</p>;

  async function salvar(dados) {
    setQrcode(await api(`/qrcodes/${id}`, { method: 'PUT', body: dados }));
  }

  function excluir() {
    if (!window.confirm(`Excluir o QR code ${qrcode.nome}?`)) return;
    exclusao.executar(async () => {
      await api(`/qrcodes/${id}`, { method: 'DELETE' });
      navegar('/qrcodes');
    });
  }

  function enviarImagem(e) {
    const arquivo = e.target.files[0];
    e.target.value = '';
    if (!arquivo) return;
    const formulario = new FormData();
    formulario.append('imagem', arquivo);
    imagem.executar(async () => setQrcode(await api(`/qrcodes/${id}/imagem`, { method: 'POST', body: formulario })));
  }

  function removerImagem() {
    imagem.executar(async () => setQrcode(await api(`/qrcodes/${id}/imagem`, { method: 'DELETE' })));
  }

  return (
    <section>
      <header className="pagina__topo">
        <div>
          <p className="sobretitulo"><Link to="/qrcodes">QR Codes</Link></p>
          <h1>{qrcode.nome}</h1>
        </div>
        <button type="button" className="btn btn--perigo" onClick={excluir}>Excluir</button>
      </header>
      <Aviso erro={exclusao.erro} />
      <div className="grade-2">
        <div className="cartao">
          <h2>Dados</h2>
          <FormQRCode key={qrcode.atualizado_em} inicial={qrcode} onSalvar={salvar} />
        </div>
        <div className="cartao">
          <h2>Imagem</h2>
          <p className="vazio">PNG ou PDF, até 10 MB.</p>
          <label className="btn">
            {qrcode.imagem_arquivo ? 'Trocar arquivo' : 'Adicionar arquivo'}
            <input type="file" accept="image/png,application/pdf" hidden aria-label="Adicionar arquivo" onChange={enviarImagem} />
          </label>
          <Aviso erro={imagem.erro} />
          {qrcode.imagem_arquivo && qrcode.imagem_arquivo.endsWith('.pdf') && (
            <iframe title="Arquivo do QR code" src={`/uploads/${qrcode.imagem_arquivo}`} />
          )}
          {qrcode.imagem_arquivo && !qrcode.imagem_arquivo.endsWith('.pdf') && (
            <img src={`/uploads/${qrcode.imagem_arquivo}`} alt="Arquivo do QR code" />
          )}
          {qrcode.imagem_arquivo && (
            <div><button type="button" className="btn btn--pequeno btn--perigo" onClick={removerImagem}>Remover arquivo</button></div>
          )}
        </div>
      </div>
    </section>
  );
}
