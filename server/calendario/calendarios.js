import { obterConfig, definirConfig } from '../repos/config.js';

const lista = (db, chave) => {
  try {
    const valor = JSON.parse(obterConfig(db, chave) ?? 'null');
    return Array.isArray(valor) ? valor : [];
  } catch {
    return [];
  }
};

// Calendários de eventos da conta, guardados na última sincronização: [{ href, nome }].
export const lerCalendarios = (db) => lista(db, 'apple_calendarios');
export const salvarCalendarios = (db, calendarios) => definirConfig(db, 'apple_calendarios', JSON.stringify(calendarios.map(({ href, nome }) => ({ href, nome }))));
// Os escondidos na tela Calendário continuam sincronizando; só não aparecem.
export const lerOcultos = (db) => lista(db, 'apple_calendarios_ocultos');
export const salvarOcultos = (db, hrefs) => definirConfig(db, 'apple_calendarios_ocultos', JSON.stringify(hrefs));

// Onde um evento novo vai parar: o escolhido, senão o "CRM Madia", senão o primeiro da lista.
export function calendarioPadrao(db) {
  const calendarios = lerCalendarios(db);
  const escolhido = obterConfig(db, 'apple_calendario_padrao');
  return calendarios.find((c) => c.href === escolhido) ?? calendarios.find((c) => c.nome === 'CRM Madia') ?? calendarios[0] ?? null;
}
