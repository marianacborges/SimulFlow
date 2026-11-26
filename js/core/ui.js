// Camada de interface: template seguro, componentes visuais, modal, confirmação, toast e delegação de eventos.
import { icone } from './icones.js';

/** Conteúdo HTML já confiável (não será escapado de novo). */
export class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
export const raw = s => new Raw(String(s ?? ''));

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function valor(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(valor).join('');
  return esc(v);
}

/** Template HTML com escape automático de tudo que for interpolado. */
export function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => { out += valor(v) + strings[i + 1]; });
  return new Raw(out);
}

export const ic = (nome, tam) => raw(icone(nome, tam));

// ---------- Componentes ----------

const TONS = {
  'Concluída': 'neutral', 'Em andamento': 'blue', 'Aguardando qualidade': 'cyan', 'Aguardando material': 'amber',
  'Parada': 'red', 'Atrasada': 'red', 'Aberta': 'blue', 'Cancelada': 'neutral', 'Concluído': 'green', 'Pausado': 'amber',
  'bloqueado': 'red', 'reprovado': 'red', 'em atraso': 'amber', 'aprovado': 'green', 'concluído': 'green', 'concluída': 'green',
  'cancelado': 'neutral', 'cancelada': 'neutral', 'não iniciado': 'neutral', 'pendente': 'neutral', 'Aprovado': 'green',
  'Reprovado': 'red', 'Aguardando laudo': 'amber', 'Alta': 'red', 'Normal': 'blue', 'Resolvida': 'green', 'Disponível': 'green',
  'Estoque baixo': 'amber', 'Arquivado': 'neutral', 'Oculto': 'neutral', 'Ativo': 'green', 'Desativado': 'neutral',
};
export function tom(status) { return TONS[status] || 'blue'; }

export function badge(texto, t) {
  const cor = t || tom(texto);
  return html`<span class="badge ${cor}"><i class="dot"></i>${texto}</span>`;
}

export function progresso(pct, rotulo) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  return html`<div class="prog">${rotulo ? html`<div class="prog-label"><span>${rotulo}</span><strong>${fmtPct(p)}</strong></div>` : ''}
    <div class="prog-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p)}"><span style="width:${p}%"></span></div></div>`;
}

export function fmtPct(p) {
  const n = Number(p) || 0;
  return (Number.isInteger(n) ? n : n.toFixed(1).replace('.', ',')) + '%';
}

export function stat({ rotulo, valor: v, icone: i = 'chart', rodape = '', cor = 'blue', href }) {
  const corpo = html`<div class="stat-top"><span>${rotulo}</span><span class="stat-icon ${cor}">${ic(i, 18)}</span></div>
    <div class="stat-value">${v}</div><div class="stat-foot">${rodape}</div>`;
  return href ? html`<a class="stat" href="${href}">${corpo}</a>` : html`<div class="stat">${corpo}</div>`;
}

export function vazio(msg = 'Nenhum registro encontrado para os filtros selecionados.') {
  return html`<div class="empty">${msg}</div>`;
}

/** Botão. opts: acao, dados (objeto data-*), v (primario|outline|ghost|perigo), icone, desab, titulo, tipo, tam (sm|icon) */
export function botao(rotulo, opts = {}) {
  const { acao, dados = {}, v = 'primario', icone: i, desab = false, titulo, tipo = 'button', tam = '' } = opts;
  const attrs = Object.entries(dados).map(([k, val]) => ` data-${k}="${esc(val)}"`).join('');
  return html`<button type="${tipo}" class="btn ${v} ${tam}"${acao ? raw(` data-acao="${esc(acao)}"`) : ''}${raw(attrs)}${desab ? raw(' disabled') : ''}${titulo ? raw(` title="${esc(titulo)}" aria-label="${esc(titulo)}"`) : ''}>${i ? ic(i) : ''}${rotulo ? html`<span>${rotulo}</span>` : ''}</button>`;
}

export function campo(rotulo, controle, opts = {}) {
  return html`<label class="field ${opts.full ? 'full' : ''}"><span class="field-label">${rotulo}${opts.obrig ? html`<b class="req">*</b>` : ''}</span>${controle}${opts.ajuda ? html`<small class="help">${opts.ajuda}</small>` : ''}</label>`;
}

/** opcoes: array de strings ou {v, t}. */
export function seletor(nome, opcoes, atual, attrs = '') {
  const ops = opcoes.map(o => typeof o === 'object' ? o : { v: o, t: o });
  return html`<select name="${nome}" ${raw(attrs)}>${ops.map(o => html`<option value="${o.v}"${String(o.v) === String(atual ?? '') ? raw(' selected') : ''}${o.desab ? raw(' disabled') : ''}>${o.t}</option>`)}</select>`;
}

/** Seletor de filtro ligado ao estado da aba (data-k). */
export function filtro(k, opcoes, atual, rotuloAria) {
  const ops = opcoes.map(o => typeof o === 'object' ? o : { v: o, t: o });
  return html`<select data-k="${k}" aria-label="${rotuloAria || k}">${ops.map(o => html`<option value="${o.v}"${String(o.v) === String(atual ?? '') ? raw(' selected') : ''}>${o.t}</option>`)}</select>`;
}

export function busca(k, valorAtual, placeholder = 'Buscar OP, projeto, responsável ou status...') {
  return html`<div class="search-field">${ic('search')}<input data-k="${k}" type="search" aria-label="Pesquisar registros" placeholder="${placeholder}" value="${valorAtual || ''}"></div>`;
}

export function alternar(k, marcado, rotulo) {
  return html`<label class="toggle"><input type="checkbox" data-k="${k}"${marcado ? raw(' checked') : ''}>${rotulo}</label>`;
}

export function cabecalho(titulo, descricao, acoes = '') {
  return html`<div class="page-heading"><div><h1>${titulo}</h1>${descricao ? html`<p>${descricao}</p>` : ''}</div><div class="heading-actions">${acoes}</div></div>`;
}

export function subabas(itens, atual, base) {
  return html`<nav class="subtabs" aria-label="Seções">${itens.map(([id, rot, icn]) => html`<a href="#/${base}/${id}" class="subtab ${id === atual ? 'active' : ''}"${id === atual ? raw(' aria-current="page"') : ''}>${icn ? ic(icn) : ''}${rot}</a>`)}</nav>`;
}

export function paginacao(total, pagina, tamanho, k = 'pagina') {
  const paginas = Math.max(1, Math.ceil(total / tamanho));
  const atual = Math.min(pagina, paginas);
  const ini = total ? (atual - 1) * tamanho + 1 : 0;
  return html`<div class="table-footer"><span>Mostrando ${ini}–${Math.min(atual * tamanho, total)} de ${total}</span>
    <div class="pagination">${botao('', { acao: 'pagina', dados: { k, p: atual - 1 }, v: 'outline', tam: 'icon', icone: 'chevronLeft', desab: atual <= 1, titulo: 'Página anterior' })}
    <span class="page-num">${atual} / ${paginas}</span>
    ${botao('', { acao: 'pagina', dados: { k, p: atual + 1 }, v: 'outline', tam: 'icon', icone: 'chevronRight', desab: atual >= paginas, titulo: 'Próxima página' })}</div></div>`;
}

// ---------- Toast ----------

export function toast(msg, tipo = 'ok') {
  if (typeof document === 'undefined') return;
  let area = document.getElementById('toasts');
  if (!area) { area = document.createElement('div'); area.id = 'toasts'; area.setAttribute('role', 'status'); document.body.appendChild(area); }
  const t = document.createElement('div');
  t.className = `toast ${tipo}`;
  t.textContent = msg;
  area.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, tipo === 'erro' ? 5000 : 3000);
}

// ---------- Formulários e modal ----------

/** Lê um formulário: nomes terminados em [] viram listas; checkbox sem [] vira booleano. */
export function lerForm(form) {
  const dados = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.name.endsWith('[]')) {
      const k = el.name.slice(0, -2);
      dados[k] = dados[k] || [];
      if ((el.type === 'checkbox' || el.type === 'radio') ? el.checked : true) {
        if (el.tagName === 'SELECT' && el.multiple) dados[k].push(...[...el.selectedOptions].map(o => o.value));
        else dados[k].push(el.value);
      }
      continue;
    }
    if (el.type === 'checkbox') dados[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) dados[el.name] = el.value; }
    else dados[el.name] = typeof el.value === 'string' ? el.value.trim() : el.value;
  }
  return dados;
}

/**
 * Abre um modal com formulário. Só fecha depois que onOk terminar sem erro
 * (erros viram toast e o formulário continua preenchido).
 */
export function modal({ titulo, descricao = '', corpo = '', rotuloOk = 'Salvar', onOk, aoMontar, largo = false, somenteLeitura = false, rotuloCancelar }) {
  const anterior = document.activeElement;
  const fundo = document.createElement('div');
  fundo.className = 'overlay';
  fundo.innerHTML = String(html`<div class="dialog ${largo ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="dlg-t">
    <div class="dialog-head"><div><h2 id="dlg-t">${titulo}</h2>${descricao ? html`<p>${descricao}</p>` : ''}</div>
    <button type="button" class="btn ghost icon" data-fechar title="Fechar" aria-label="Fechar">${ic('x')}</button></div>
    <form class="dialog-form" novalidate>${raw(String(corpo))}
    <div class="modal-actions">${somenteLeitura ? html`<button type="button" class="btn outline" data-fechar>${rotuloCancelar || 'Fechar'}</button>` :
      html`<button type="button" class="btn outline" data-fechar>${rotuloCancelar || 'Cancelar'}</button><button type="submit" class="btn primario">${rotuloOk}</button>`}</div></form></div>`);
  document.body.appendChild(fundo);
  const form = fundo.querySelector('form');
  let ocupado = false;
  const fechar = () => { fundo.remove(); document.removeEventListener('keydown', tecla); if (anterior && anterior.focus) try { anterior.focus(); } catch { /* elemento removido */ } };
  const tecla = e => { if (e.key === 'Escape' && !ocupado) fechar(); };
  document.addEventListener('keydown', tecla);
  fundo.addEventListener('click', e => { if (e.target.closest('[data-fechar]') && !ocupado) fechar(); });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (somenteLeitura || ocupado) return;
    if (!form.checkValidity()) { form.reportValidity(); const inv = form.querySelector(':invalid'); toast(inv ? `Verifique o campo: ${rotuloDe(inv)}` : 'Verifique os campos', 'erro'); return; }
    ocupado = true;
    const btn = form.querySelector('[type=submit]');
    const texto = btn.textContent; btn.disabled = true; btn.textContent = 'Salvando…';
    try {
      const r = await onOk?.(lerForm(form), form);
      if (r === false) return;
      fechar();
    } catch (err) {
      toast(err?.message || 'Não foi possível salvar', 'erro');
    } finally {
      ocupado = false; btn.disabled = false; btn.textContent = texto;
    }
  });
  aoMontar?.(form, fundo);
  const primeiro = form.querySelector('input:not([type=hidden]):not([readonly]),select,textarea');
  (primeiro || form.querySelector('button'))?.focus();
  return { fechar, form };
}

function rotuloDe(el) {
  return el.closest('label')?.querySelector('.field-label')?.textContent?.replace('*', '') || el.name;
}

export function confirmar(titulo, descricao, rotuloOk = 'Confirmar') {
  return new Promise(resolve => {
    let ok = false;
    const m = modal({ titulo, descricao, rotuloOk, onOk: () => { ok = true; } });
    const obs = new MutationObserver(() => { if (!document.body.contains(m.form)) { obs.disconnect(); resolve(ok); } });
    obs.observe(document.body, { childList: true });
  });
}

/** Mostra informação somente leitura (histórico etc.). */
export function janela(titulo, descricao, corpo, largo = true) {
  return modal({ titulo, descricao, corpo, somenteLeitura: true, largo });
}

// ---------- Delegação de eventos ----------

/**
 * Liga cliques em [data-acao] e mudanças em [data-k] dentro do contêiner.
 * cliques: { nomeDaAcao(dataset, elemento, evento) }, mudanca(k, valor, elemento),
 * soltar(idArrastado, destino) para arrastar e soltar ([data-arrastar] → [data-soltar]).
 */
export function delegar(el, { cliques = {}, mudanca, soltar } = {}) {
  const clique = e => {
    const alvo = e.target.closest('[data-acao]');
    if (!alvo || !el.contains(alvo) || alvo.disabled) return;
    const fn = cliques[alvo.dataset.acao];
    if (fn) { e.preventDefault(); Promise.resolve(fn(alvo.dataset, alvo, e)).catch(err => toast(err?.message || 'Erro', 'erro')); }
  };
  const muda = e => {
    const alvo = e.target.closest('[data-k]');
    if (!alvo || !el.contains(alvo) || !mudanca) return;
    if (e.type === 'input' && (alvo.tagName === 'SELECT' || alvo.type === 'checkbox' || alvo.type === 'date' || alvo.type === 'month')) return;
    if (e.type === 'change' && alvo.tagName === 'INPUT' && !['checkbox', 'date', 'month'].includes(alvo.type)) return;
    mudanca(alvo.dataset.k, alvo.type === 'checkbox' ? alvo.checked : alvo.value, alvo);
  };
  const inicioArraste = e => { const a = e.target.closest('[data-arrastar]'); if (a) e.dataTransfer.setData('text/plain', a.dataset.arrastar); };
  const sobre = e => { if (e.target.closest('[data-soltar]')) e.preventDefault(); };
  const solta = e => { const z = e.target.closest('[data-soltar]'); if (!z || !soltar) return; e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (id) Promise.resolve(soltar(id, z.dataset.soltar)).catch(err => toast(err?.message || 'Erro', 'erro')); };
  el.addEventListener('click', clique);
  el.addEventListener('input', muda);
  el.addEventListener('change', muda);
  el.addEventListener('dragstart', inicioArraste);
  el.addEventListener('dragover', sobre);
  el.addEventListener('drop', solta);
  return () => {
    el.removeEventListener('click', clique); el.removeEventListener('input', muda); el.removeEventListener('change', muda);
    el.removeEventListener('dragstart', inicioArraste); el.removeEventListener('dragover', sobre); el.removeEventListener('drop', solta);
  };
}
