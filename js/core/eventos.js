// Barramento simples de eventos (publicar/assinar) para desacoplar módulos.
const ouvintes = new Map();

export function assinar(nome, fn) {
  if (!ouvintes.has(nome)) ouvintes.set(nome, new Set());
  ouvintes.get(nome).add(fn);
  return () => ouvintes.get(nome)?.delete(fn);
}

export function publicar(nome, dados) {
  for (const fn of ouvintes.get(nome) || []) {
    try { fn(dados); } catch (e) { console.error(`Erro no ouvinte de "${nome}"`, e); }
  }
}
