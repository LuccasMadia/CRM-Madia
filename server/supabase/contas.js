import { obterConfig, definirConfig } from '../repos/config.js';

const CHAVE = 'supabase_contas';

export function salvarContas(db, contas) {
  if (!contas.length) db.prepare('DELETE FROM config WHERE chave = ?').run(CHAVE);
  else definirConfig(db, CHAVE, JSON.stringify(contas));
}

// Contas do Supabase: [{ id, nome, token }]. O token único da versão anterior vira a conta "Principal".
export function lerContas(db) {
  const antigo = obterConfig(db, 'supabase_token');
  if (antigo && !obterConfig(db, CHAVE)) {
    salvarContas(db, [{ id: 1, nome: 'Principal', token: antigo }]);
  }
  if (antigo) db.prepare("DELETE FROM config WHERE chave = 'supabase_token'").run();
  try {
    const lista = JSON.parse(obterConfig(db, CHAVE) ?? '[]');
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}
