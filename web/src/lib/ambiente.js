// O CRM só sobe arquivos pelo PC (127.0.0.1/localhost); no endereço público não há upload.
export const ehPc = () => ['127.0.0.1', 'localhost'].includes(window.location.hostname);
