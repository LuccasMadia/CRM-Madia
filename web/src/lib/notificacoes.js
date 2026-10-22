import { useSyncExternalStore } from 'react';

// Avisos curtos de "deu certo" (Cliente salvo, Parcela excluída...) que somem sozinhos.
const DURACAO = 4000;
const ouvintes = new Set();
let lista = [];
let proximo = 1;

function publicar(nova) {
  lista = nova;
  ouvintes.forEach((avisar) => avisar());
}

export function dispensar(id) {
  publicar(lista.filter((n) => n.id !== id));
}

export function notificar(texto) {
  const id = proximo++;
  publicar([...lista, { id, texto }]);
  setTimeout(() => dispensar(id), DURACAO);
  return id;
}

function assinar(avisar) {
  ouvintes.add(avisar);
  return () => ouvintes.delete(avisar);
}

export const useNotificacoes = () => useSyncExternalStore(assinar, () => lista);
