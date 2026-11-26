// Peças reutilizadas por várias abas: campos extras, histórico, nomes, opções de seleção.
import { html, raw, campo, seletor, janela, vazio } from '../core/ui.js';
import { camposExtras } from '../core/config.js';
import { dataHora, data } from '../core/util.js';

/** Inputs dos campos extras de uma entidade (config/campos.json → comando `campo`). */
export function formCamposExtras(entidade, valores = {}) {
  const lista = camposExtras(entidade);
  if (!lista.length) return '';
  return html`${lista.map(c => {
    const nome = 'campo.' + c.nome;
    const v = valores?.[c.nome] ?? '';
    const rot = c.rotulo || c.nome;
    if (c.tipo === 'numero') return campo(rot, html`<input name="${nome}" type="number" step="any" value="${v}">`);
    if (c.tipo === 'data') return campo(rot, html`<input name="${nome}" type="date" value="${v}">`);
    if (c.tipo === 'sim-nao') return campo(rot, seletor(nome, [{ v: '', t: '—' }, 'Sim', 'Não'], v));
    if (c.tipo === 'lista') return campo(rot, seletor(nome, [{ v: '', t: 'Selecione' }, ...(c.opcoes || [])], v));
    if (c.tipo === 'texto-longo') return campo(rot, html`<textarea name="${nome}">${v}</textarea>`, { full: true });
    return campo(rot, html`<input name="${nome}" value="${v}">`);
  })}`;
}

/** Exibição dos campos extras preenchidos (detalhes). */
export function mostrarCamposExtras(entidade, valores = {}) {
  const lista = camposExtras(entidade).filter(c => valores?.[c.nome] !== undefined && valores?.[c.nome] !== '');
  return lista.map(c => html`<div><small>${c.rotulo || c.nome}</small><strong>${c.tipo === 'data' ? data(valores[c.nome]) : valores[c.nome]}</strong></div>`);
}

export function nomeUsuario(store, id, padrao = '—') {
  return store.obter('usuarios', id)?.nome || padrao;
}

export function opcoesUsuarios(store, { vazio: rotuloVazio = 'Selecione', filtro = () => true } = {}) {
  return [{ v: '', t: rotuloVazio }, ...store.filtrar('usuarios', u => u.ativo && filtro(u)).map(u => ({ v: u.id, t: `${u.nome} · ${u.host ? 'Host' : u.area}` }))];
}

const ROTULOS = {
  realizado: 'Quantidade realizada', previsto: 'Quantidade prevista', status: 'Status', etapaId: 'Etapa', cicloId: 'Ciclo', prazo: 'Prazo',
  arquivado: 'Arquivado', estoque: 'Estoque', produzido: 'Produzido', disponiveis: 'Disponíveis', previstos: 'Previstos', limites: 'Limites (h)',
  responsavelId: 'Responsável', temSubprojetos: 'Possui sub-projetos', escopoEtapas: 'Escopo de etapas', maxDias: 'Limite de dias',
};

function valorLegivel(store, k, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (k === 'etapaId') return store.obter('etapas', v)?.nome || 'Sem etapa';
  if (k === 'cicloId') { const c = store.obter('ciclos', v); return c ? `${data(c.inicio)} → ${data(c.fim)}` : '—'; }
  if (k === 'responsavelId') return nomeUsuario(store, v);
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function diferencas(store, antes, depois) {
  if (!depois) return [];
  const a = antes || {};
  return Object.keys(ROTULOS).filter(k => depois[k] !== undefined && JSON.stringify(a[k]) !== JSON.stringify(depois[k]))
    .map(k => `${ROTULOS[k]}: ${valorLegivel(store, k, a[k])} → ${valorLegivel(store, k, depois[k])}`);
}

export function linhasHistorico(store, registros) {
  if (!registros.length) return vazio('Nenhum registro encontrado.');
  return html`<div class="history-list">${registros.map(a => html`<div class="alert-item"><span class="alert-symbol blue">${raw('<svg width="10" height="10"><circle cx="5" cy="5" r="4" fill="currentColor"/></svg>')}</span><div class="alert-copy">
    <strong>${a.acao}</strong><p>${dataHora(a.em)} · ${a.ator}${a.turno ? ' · Turno ' + a.turno : ''}</p>
    ${diferencas(store, a.antes, a.depois).map(t => html`<p>${t}</p>`)}
    ${a.acao === 'Laudo de qualidade' && a.depois?.laudo ? html`<p>${a.depois.laudo.status} · ${a.depois.laudo.por}</p>` : ''}
    ${a.acao === 'Consumo de material' && a.depois ? html`<p>${a.depois.codigo} · ${a.depois.nome}: ${a.depois.quantidade} ${a.depois.unidade}</p>` : ''}
    ${a.nota ? html`<p>${a.nota}</p>` : ''}</div></div>`)}</div>`;
}

/** Abre o histórico (auditoria) de um ou mais registros. */
export function abrirHistorico(store, titulo, filtro) {
  const regs = store.filtrar('auditoria', filtro).slice().sort((a, b) => b.em.localeCompare(a.em));
  janela('Histórico · ' + titulo, 'Registros preservados com usuário, data e hora.', linhasHistorico(store, regs));
}

export function obrasRaiz(store, { arquivadas = false, ocultas = true } = {}) {
  return store.filtrar('obras', o => !o.parentId && (arquivadas ? true : !o.arquivado) && (ocultas || !o.oculto));
}

function definir(obj, caminho, valor) {
  const partes = caminho.split('.');
  let alvo = obj;
  for (const p of partes.slice(0, -1)) alvo = alvo[p] = alvo[p] && typeof alvo[p] === 'object' ? alvo[p] : {};
  alvo[partes.at(-1)] = valor;
}
function ler(obj, caminho) {
  return caminho.split('.').reduce((o, p) => (o ? o[p] : undefined), obj);
}

/**
 * Liga o estado local da aba aos filtros ([data-k="prefixo.campo"]), à paginação
 * (data-acao="pagina") e ao botão "Limpar filtros" (data-acao="limpar" data-prefixo).
 */
export function controleEstado(estado, ctx) {
  return {
    mudanca: (k, v) => {
      definir(estado, k, v);
      if (!k.endsWith('.pagina')) { const pref = k.split('.').slice(0, -1).join('.'); if (pref) definir(estado, pref + '.pagina', 1); }
      ctx.rerender();
    },
    cliques: {
      pagina: d => { definir(estado, d.k, Math.max(1, Number(d.p))); ctx.rerender(); },
      limpar: d => {
        const alvo = ler(estado, d.prefixo) || {};
        for (const k of Object.keys(alvo)) if (!['ordem', 'arquivados', 'ocultos'].includes(k)) alvo[k] = typeof alvo[k] === 'boolean' ? false : Array.isArray(alvo[k]) ? [] : '';
        alvo.pagina = 1;
        ctx.rerender();
      },
    },
  };
}

export function rotuloCiclo(c) {
  return c ? `${data(c.inicio)} → ${data(c.fim)} · ${c.status}` : 'Sem ciclo';
}
