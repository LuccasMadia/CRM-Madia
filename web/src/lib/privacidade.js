import { useSyncExternalStore } from 'react';

// Modo "ocultar valores": esconde dinheiro da tela para mostrar o CRM a clientes sem expor faturamento.
const CHAVE = 'crm.valoresOcultos';
const ouvintes = new Set();

function lerSalvo() {
  try {
    return localStorage.getItem(CHAVE) === '1';
  } catch {
    return false;
  }
}

let ocultos = lerSalvo();

export const valoresOcultos = () => ocultos;

export function definirValoresOcultos(valor) {
  ocultos = valor;
  try {
    localStorage.setItem(CHAVE, valor ? '1' : '0');
  } catch {
    // sem armazenamento (navegação privada etc.): a escolha só vale nesta visita
  }
  ouvintes.forEach((avisar) => avisar());
}

export const alternarValoresOcultos = () => definirValoresOcultos(!ocultos);

function assinar(avisar) {
  ouvintes.add(avisar);
  return () => ouvintes.delete(avisar);
}

export const useValoresOcultos = () => useSyncExternalStore(assinar, valoresOcultos);
