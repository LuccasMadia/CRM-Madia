function campoTlv(id, valor) {
  return `${id}${String(valor.length).padStart(2, '0')}${valor}`;
}

function removerAcentos(texto) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function sanitizar(texto, tamanhoMax) {
  return removerAcentos(texto)
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .trim()
    .slice(0, tamanhoMax);
}

export function crc16(payload) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function gerarCodigoPix({ chave, nomeRecebedor, cidade }) {
  const merchantAccountInfo = campoTlv('26', campoTlv('00', 'br.gov.bcb.pix') + campoTlv('01', chave.trim()));
  const additionalData = campoTlv('62', campoTlv('05', '***'));
  const semCrc =
    campoTlv('00', '01') +
    campoTlv('01', '11') +
    merchantAccountInfo +
    campoTlv('52', '0000') +
    campoTlv('53', '986') +
    campoTlv('58', 'BR') +
    campoTlv('59', sanitizar(nomeRecebedor, 25)) +
    campoTlv('60', sanitizar(cidade, 15)) +
    additionalData +
    '6304';
  return semCrc + crc16(semCrc);
}
