// Gráficos simples em SVG/HTML (sem bibliotecas): rosca e barras.
import { html, raw } from '../core/ui.js';

const CORES = { blue: 'var(--blue)', green: 'var(--green)', amber: 'var(--amber)', red: 'var(--red)', cyan: 'var(--cyan)', neutral: 'var(--neutral)' };

/** dados: [{ rotulo, valor, cor, href }] */
export function rosca(dados, total, legendaCentro) {
  const soma = dados.reduce((s, d) => s + d.valor, 0) || 1;
  const r = 15.9155; // circunferência = 100
  let acumulado = 0;
  const fatias = dados.filter(d => d.valor > 0).map(d => {
    const parte = d.valor / soma * 100;
    const s = `<circle cx="21" cy="21" r="${r}" fill="none" stroke="${CORES[d.cor] || CORES.blue}" stroke-width="5" stroke-dasharray="${Math.max(0, parte - 0.8)} ${100 - Math.max(0, parte - 0.8)}" stroke-dashoffset="${25 - acumulado}"></circle>`;
    acumulado += parte;
    return s;
  }).join('');
  return html`<div class="donut-body"><div class="donut">${raw(`<svg viewBox="0 0 42 42" width="160" height="160" role="img" aria-label="Distribuição por status"><circle cx="21" cy="21" r="${r}" fill="none" stroke="var(--neutral-soft)" stroke-width="5"></circle>${fatias}</svg>`)}
    <div class="donut-center"><strong>${total}</strong><span>${legendaCentro}</span></div></div>
    <div class="legend">${dados.map(d => d.href ? html`<a href="${d.href}"><i class="swatch" style="background:${raw(CORES[d.cor] || CORES.blue)}"></i>${d.rotulo}<strong>${d.valor}</strong></a>`
      : html`<div><i class="swatch" style="background:${raw(CORES[d.cor] || CORES.blue)}"></i>${d.rotulo}<strong>${d.valor}</strong></div>`)}</div></div>`;
}

/** Barras horizontais com duas séries (planejado × realizado). linhas: [{ rotulo, total, feito }] */
export function barras(linhas, { rotuloTotal = 'Planejado', rotuloFeito = 'Realizado' } = {}) {
  return html`<div class="bars">${linhas.map(l => {
    const pct = l.total ? Math.min(100, l.feito / l.total * 100) : 0;
    return html`<div class="bar-row" title="${rotuloFeito}: ${l.feito} de ${l.total}"><span>${l.rotulo}</span><div class="bar-track"><span style="width:${raw(pct.toFixed(1))}%;background:var(--primary)"></span></div><strong>${Math.round(pct)}%</strong></div>`;
  })}<p class="muted small">${rotuloFeito} sobre ${rotuloTotal.toLowerCase()}.</p></div>`;
}
