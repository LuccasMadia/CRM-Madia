import { obterConfig, definirConfig } from '../repos/config.js';

const CHAVE = 'supabase_contas';

export function salvarContas(db, contas) {
  if (!contas.length) db.prepare('DELETE FROM config WHERE chave = ?').run(CHAVE);
  else definirConfig(db, CHAVE, JSON.stringify(contas));
}

// Contas do Supabase: [{ id, email, token }]. O token único da versão anterior vira a conta "Principal" (sem e-mail conhecido).
export function lerContas(db) {
  const antigo = obterConfig(db, 'supabase_token');
  if (antigo && !obterConfig(db, CHAVE)) {
    salvarContas(db, [{ id: 1, email: 'Principal', token: antigo }]);
  }
  if (antigo) db.prepare("DELETE FROM config WHERE chave = 'supabase_token'").run();
  try {
    const lista = JSON.parse(obterConfig(db, CHAVE) ?? '[]');
    // contas salvas antes de existir o e-mail tinham `nome`
    return Array.isArray(lista) ? lista.map(({ nome, ...conta }) => ({ ...conta, email: conta.email ?? nome })) : [];
  } catch {
    return [];
  }
}
