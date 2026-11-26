// Tema da tela: automático (segue o sistema), claro ou escuro. Fica salvo neste navegador.
// O index.html aplica o tema salvo antes de carregar o CSS, para a tela não "piscar".
import { publicar } from './eventos.js';

const CHAVE = 'simulflow.tema';
export const TEMAS = { auto: 'Automático (segue o sistema)', claro: 'Claro', escuro: 'Escuro' };

export function temaEscolhido() {
  try { const t = localStorage.getItem(CHAVE); return t === 'claro' || t === 'escuro' ? t : 'auto'; } catch { return 'auto'; }
}

/** Tema que está valendo agora: 'claro' ou 'escuro'. */
export function temaEfetivo() {
  const t = temaEscolhido();
  if (t !== 'auto') return t;
  return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro';
}

export function aplicarTema() {
  const t = temaEscolhido();
  const raiz = document.documentElement;
  if (t === 'auto') raiz.removeAttribute('data-theme');
  else raiz.dataset.theme = t === 'escuro' ? 'dark' : 'light';
  publicar('tema', { escolhido: t, efetivo: temaEfetivo() });
}

export function definirTema(t) {
  try {
    if (t === 'auto') localStorage.removeItem(CHAVE); else localStorage.setItem(CHAVE, t);
  } catch { /* sem armazenamento: vale só nesta página */ }
  if (t !== 'auto') document.documentElement.dataset.theme = t === 'escuro' ? 'dark' : 'light';
  aplicarTema();
}

/** Botão do topo: alterna entre claro e escuro (a partir do tema que está valendo). */
export function alternarTema() {
  definirTema(temaEfetivo() === 'escuro' ? 'claro' : 'escuro');
}

// Se o usuário estiver no automático e o sistema mudar de tema, atualiza o ícone do botão.
globalThis.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (temaEscolhido() === 'auto') aplicarTema(); });
