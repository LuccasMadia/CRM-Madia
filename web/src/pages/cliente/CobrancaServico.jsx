import { api } from '../../api/client.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { Aviso } from '../../components/Aviso.jsx';
import { formatarDinheiro } from '../../lib/dinheiro.js';
import { formatarData, hojeISO } from '../../lib/datas.js';

export function CobrancaServico({ projeto, parcelas, onPago }) {
  const envio = useEnvio();
  if (!parcelas) return null;
  const valor = projeto.mensalidade_ativa
    ? `${formatarDinheiro(projeto.mensalidade_valor_centavos)}/mês, dia ${projeto.mensalidade_dia_vencimento}`
    : formatarDinheiro(projeto.valor_total_centavos);
  const abertas = parcelas.filter((p) => !p.pago_em);
  const [proxima] = abertas;

  function marcarPago() {
    envio.executar(async () => {
      await api(`/parcelas/${proxima.id}`, { method: 'PUT', body: { pago_em: hojeISO() } });
      onPago();
    });
  }

  let situacao = '';
  if (proxima) situacao = ` · a receber (vence ${formatarData(proxima.vencimento)})`;
  else if (parcelas.length) situacao = ' · pago';

  return (
    <span>
      {valor}{situacao}
      {proxima && (
        <>{' '}<button type="button" className="btn btn--fantasma btn--pequeno" onClick={marcarPago} disabled={envio.enviando}>Marcar pago</button></>
      )}
      <Aviso erro={envio.erro} />
    </span>
  );
}
