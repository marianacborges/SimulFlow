// Logo das telas de acesso (login e configuração do celular): PNG com fundo transparente, uma versão por tema.
// A animada toca uma vez e para no logo completo; com "reduzir movimento" no sistema, mostra só o logo parado.
import { html } from './ui.js';
import { temaEfetivo } from './tema.js';

const LOGOS = {
  claro: { animado: 'img/logo-animado-claro.png', parado: 'img/logo-claro.png' },
  escuro: { animado: 'img/logo-animado-escuro.png', parado: 'img/logo-escuro.png' },
};

export function logoAcesso(texto = 'SimulFlow — Simultaneous Production Tracking') {
  const logo = LOGOS[temaEfetivo()] || LOGOS.claro;
  const parado = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  return html`<div class="auth-logo"><img src="${parado ? logo.parado : logo.animado}" alt="${texto}" width="340" height="265"></div>`;
}
