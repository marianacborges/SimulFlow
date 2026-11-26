// Acompanhamento da programação (parte de baixo da aba Dashboard): indicadores, alertas e movimentações
// filtrados por período, status, obra, etapa e tipo de ensaio. Mostra só as obras liberadas ao usuário
// (o host vê todas). Os filtros ficam recolhidos e valem só nesta sessão do navegador.
import { html, botao, campo, modal, toast, vazio, delegar, stat, raw, ic } from '../core/ui.js';
import { dataHora, data } from '../core/util.js';
import { montarPainel, filtrosPadrao, periodo, erroPeriodo, statusRotulo, STATUS_ITEM, STATUS_EXTRA, STATUS_ENSAIO_FILTRO } from '../data/painel-dados.js';
import { relatorioPDF } from '../core/exportar.js';

let aplicado = null, rascunho = null, erro = '', usuarioDosFiltros = '';
let filtrosAbertos = false;

const chave = u => 'simulflow.filtros.dashboard.' + u.id;

function obrasLiberadas(ctx) {
  const { store, usuario } = ctx;
  const ativas = store.filtrar('obras', o => !o.parentId && !o.arquivado);
  return ctx.host ? ativas : ativas.filter(o => (usuario.obrasDashboard || []).includes(o.id));
}

function dados(ctx) {
  const { store } = ctx;
  const ids = new Set(obrasLiberadas(ctx).map(o => o.id));
  const todasIds = new Set(store.filtrar('obras', o => ids.has(o.id) || ids.has(o.parentId)).map(o => o.id));
  const itens = store.filtrar('itens', i => ids.has(i.obraId));
  const itemIds = new Set(itens.map(i => i.id));
  const ensaios = store.filtrar('ensaios', e => itemIds.has(e.itemId));
  return {
    obras: store.filtrar('obras', o => todasIds.has(o.id)), etapas: store.filtrar('etapas', e => todasIds.has(e.obraId)), ciclos: store.filtrar('ciclos', c => ids.has(c.obraId)),
    itens, ensaios, tipos: store.filtrar('tiposEnsaio', t => ensaios.some(e => e.tipoId === t.id)), extras: store.filtrar('extras', x => itemIds.has(x.itemId)),
    eventos: store.filtrar('eventos', e => ids.has(e.obraId)), auditoria: store.filtrar('auditoria', a => ids.has(a.obraId)),
  };
}

function iniciarFiltros(ctx, d) {
  if (usuarioDosFiltros === ctx.usuario.id && aplicado) return;
  usuarioDosFiltros = ctx.usuario.id;
  aplicado = filtrosPadrao(d.ciclos);
  try {
    const salvo = JSON.parse(sessionStorage.getItem(chave(ctx.usuario)) || 'null');
    if (salvo && !erroPeriodo(salvo, ctx.store.config.dashboardMaxDias)) aplicado = { ...aplicado, ...salvo, obras: (salvo.obras || []).filter(id => d.obras.some(o => o.id === id)) };
  } catch { /* sem sessão: usa o ciclo atual */ }
  rascunho = structuredClone(aplicado);
}

function multi(nome, rotulo, opcoes, marcados) {
  return html`<div class="field"><span class="field-label">${rotulo}</span><details class="multi"><summary class="btn outline full">${marcados.length ? `${marcados.length} selecionado(s)` : 'Todos'}</summary>
    <div class="check-list">${opcoes.map(o => html`<label><input type="checkbox" data-multi="${nome}" value="${o.v}"${marcados.includes(o.v) ? raw(' checked') : ''}>${o.t}</label>`)}${opcoes.length ? '' : html`<p class="muted">Nenhuma opção autorizada</p>`}</div></details></div>`;
}

function linhas(titulo, lista, datas = false) {
  return html`<section class="section"><h2>${titulo} <span class="count-pill">${lista.length}</span></h2>
    ${lista.length ? html`<div class="panel" style="margin-top:10px">${lista.map(r => html`<article class="alert-item"><div class="alert-copy"><div class="title-row"><a class="link" href="#/programacao/obra/${r.obraId}">${r.obra} · ${r.entidade}</a><small>${datas ? 'Data prevista: ' + data(r.data) : dataHora(r.data)}</small></div>
      <p><strong>${r.tipo}</strong> · ${r.status}${r.ator ? ' · ' + r.ator : ''}</p><p>${r.detalhe}</p></div></article>`)}</div>` : vazio('Nenhum registro para os filtros selecionados')}</section>`;
}

export function secaoProgramacao(ctx) {
  const { store } = ctx;
  const liberadas = obrasLiberadas(ctx);
  if (!liberadas.length) return html`<section class="section"><h2>Acompanhamento da programação</h2><div class="panel" style="margin-top:10px"><p class="muted">Não há obras liberadas para você neste painel. O host define as obras autorizadas no cadastro do usuário.</p></div></section>`;
  const d = dados(ctx);
  iniciarFiltros(ctx, d);
  const r = rascunho;
  const max = store.config.dashboardMaxDias;
  const v = montarPainel(d, aplicado);
  const etapas = d.etapas.filter(e => !e.arquivado && (!r.obras.length || r.obras.includes(e.obraId) || r.obras.includes(store.obter('obras', e.obraId)?.parentId)));
  const cicloAtivo = d.ciclos.some(c => c.inicio <= aplicado.fim && c.fim >= aplicado.inicio && c.status !== 'encerrado');
  const exportacoes = store.filtrar('auditoria', a => a.acao === 'Dashboard exportado em PDF').sort((a, b) => b.em.localeCompare(a.em));
  return html`<section class="section" id="programacao-painel"><div class="section-title"><div><h2>Acompanhamento da programação</h2><p class="muted small">Indicadores, alertas e movimentações das obras liberadas para você.</p></div>
      <div class="toolbar">${ctx.host ? botao('', { acao: 'limite', v: 'outline', tam: 'icon', icone: 'settings', titulo: 'Configurar limite de período' }) : ''}
      ${botao('Exportar PDF', { acao: 'pdf', icone: 'download', desab: !!erroPeriodo(aplicado, max) })}</div></div>
    <details class="painel-filtros" data-caixa-filtros${filtrosAbertos || erro ? raw(' open') : ''}><summary>${ic('settings')}<span class="painel-filtros-resumo"><strong>Filtros</strong> ${v.resumo}</span><span class="painel-filtros-acao">Configurar</span></summary>
    <form data-filtros>
      <div class="grid-3"><label class="field"><span class="field-label">Período</span><select name="preset" data-preset>${[['ciclo', 'Ciclo tri-semanal atual'], ['hoje', 'Hoje'], ['7', 'Últimos 7 dias'], ['30', 'Últimos 30 dias'], ['custom', 'Personalizado']].map(([vv, t]) => html`<option value="${vv}"${r.preset === vv ? raw(' selected') : ''}>${t}</option>`)}</select></label>
        ${campo('Data inicial', html`<input type="date" name="inicio" value="${r.inicio}" data-data>`)}${campo('Data final', html`<input type="date" name="fim" value="${r.fim}" data-data>`)}</div>
      <div class="grid-3" style="margin-top:12px">${multi('statusItem', 'Status dos itens', STATUS_ITEM.map(s => ({ v: s, t: s })), r.statusItem)}
        ${multi('statusEnsaio', 'Status dos ensaios', STATUS_ENSAIO_FILTRO.map(s => ({ v: s, t: statusRotulo(s) })), r.statusEnsaio)}
        ${multi('statusExtra', 'Status das etapas adicionais', STATUS_EXTRA.map(s => ({ v: s, t: s })), r.statusExtra)}</div>
      <div class="grid-3" style="margin-top:12px">${multi('obras', 'Obra', liberadas.map(o => ({ v: o.id, t: o.nome })), r.obras)}
        <label class="field"><span class="field-label">Etapa</span><select name="etapa"><option value="">Todas</option>${etapas.map(e => html`<option value="${e.id}"${r.etapa === e.id ? raw(' selected') : ''}>${e.nome}</option>`)}</select></label>
        <label class="field"><span class="field-label">Tipo de ensaio</span><select name="tipo"><option value="">Todos</option>${d.tipos.map(t => html`<option value="${t.id}"${r.tipo === t.id ? raw(' selected') : ''}>${t.nome}</option>`)}</select></label></div>
      <div class="toolbar" style="margin-top:14px">${botao('Aplicar filtros', { acao: 'aplicar', icone: 'check' })}${botao('Limpar filtros', { acao: 'limpar-filtros', v: 'outline', icone: 'x' })}</div>
      ${erro ? html`<p role="alert" class="error">${erro}</p>` : ''}
      ${!cicloAtivo && aplicado.preset === 'ciclo' ? html`<p class="muted small">Nenhum ciclo atual disponível. Período exibido: hoje.</p>` : ''}
    </form></details>
    <div class="stats" style="margin-top:18px">${v.indicadores.map(i => stat({ rotulo: i.rotulo, valor: i.valor, icone: i.icone, cor: i.cor, rodape: i.detalhe }))}</div>
    <p class="muted small">Itens: data prevista. Ensaios: data da solicitação. Etapas adicionais: data prevista. Alertas e movimentações: data do registro.</p>
    ${linhas('Alertas', v.alertas)}${linhas('Movimentações', v.movimentos)}${linhas('Itens em atraso fora do período', v.atrasos, true)}
    ${ctx.host && exportacoes.length ? html`<section class="section"><h2>Histórico de exportações</h2><div class="panel" style="margin-top:10px">${exportacoes.map(a => html`<div class="alert-item"><div class="alert-copy"><strong>${a.ator}</strong> · ${dataHora(a.em)}<p>${a.depois?.resumo || ''}</p></div></div>`)}</div></section>` : ''}</section>`;
}

function lerRascunho(el) {
  const form = el.querySelector('[data-filtros]');
  if (!form) return;
  const multi = n => [...form.querySelectorAll(`[data-multi="${n}"]:checked`)].map(i => i.value);
  rascunho = {
    preset: form.preset.value, inicio: form.inicio.value, fim: form.fim.value, etapa: form.etapa.value, tipo: form.tipo.value,
    statusItem: multi('statusItem'), statusEnsaio: multi('statusEnsaio'), statusExtra: multi('statusExtra'), obras: multi('obras'),
  };
}

function aplicar(ctx, filtros) {
  const e = erroPeriodo(filtros, ctx.store.config.dashboardMaxDias);
  if (e) { erro = e; ctx.rerender(); return; }
  erro = '';
  aplicado = structuredClone(filtros);
  rascunho = structuredClone(filtros);
  filtrosAbertos = false;
  try { sessionStorage.setItem(chave(ctx.usuario), JSON.stringify(aplicado)); } catch { /* sem sessão */ }
  ctx.rerender();
}

function exportarPDF(ctx) {
  const e = erroPeriodo(aplicado, ctx.store.config.dashboardMaxDias);
  if (e) throw new Error(e);
  const d = dados(ctx);
  const v = montarPainel(d, aplicado);
  const fmt = r => `${dataHora(r.data)} | ${r.tipo} | Obra: ${r.obra} | ${r.entidade} | Status atual: ${r.status}${r.ator ? ' | Usuário: ' + r.ator : ''}\n${r.detalhe}`;
  const nome = aplicado.obras.length === 1 ? (d.obras.find(o => o.id === aplicado.obras[0])?.nome || 'geral') : 'geral';
  const arquivo = `dashboard_${nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9_-]/g, '_')}_${aplicado.inicio}_a_${aplicado.fim}`;
  const ok = relatorioPDF({
    titulo: 'SimulFlow | Dashboard de acompanhamento', arquivo, cabecalho: [`Geração: ${new Date().toLocaleString('pt-BR')} | Usuário: ${ctx.usuario.nome}`, v.resumo],
    secoes: [{ titulo: 'Indicadores', linhas: v.indicadores.map(i => `${i.rotulo}: ${i.valor} | ${i.detalhe}`) }, { titulo: 'Alertas', linhas: v.alertas.map(fmt) },
      { titulo: 'Movimentações', linhas: v.movimentos.map(fmt) }, { titulo: 'Itens em atraso fora do período', linhas: v.atrasos.map(r => `${r.obra} | ${r.entidade} | Data prevista: ${data(r.data)} | Status: ${r.status}\n${r.detalhe}`) }],
  });
  if (ok) { ctx.acoes.programacao.registrarExportacao({ filtros: aplicado, resumo: v.resumo, obraIds: [...new Set(v.itens.map(i => i.obraId))] }); toast('PDF gerado e registrado no histórico'); }
}

/** Liga os cliques e mudanças dos filtros. Retorna a função que desliga. */
export function ligarProgramacao(el, ctx) {
  const desligarCliques = delegar(el, {
    cliques: {
      aplicar: () => { lerRascunho(el); aplicar(ctx, rascunho); },
      'limpar-filtros': () => aplicar(ctx, filtrosPadrao(dados(ctx).ciclos)),
      pdf: () => exportarPDF(ctx),
      limite: () => modal({
        titulo: 'Limite de período do Dashboard', descricao: 'Configuração do host. Sem valor definido, não há limite de consulta.',
        corpo: campo('Máximo de dias', html`<input name="dias" type="number" min="1" step="1" value="${ctx.store.config.dashboardMaxDias ?? ''}">`),
        rotuloOk: 'Salvar limite', onOk: v => { ctx.acoes.programacao.definirLimiteDashboard({ dias: v.dias }); toast('Limite atualizado e registrado no histórico'); },
      }),
    },
  });
  const muda = e => {
    if (!e.target.closest('[data-filtros]')) return;
    filtrosAbertos = true; // está configurando: a caixa continua aberta ao redesenhar
    if (e.target.matches('[data-preset]')) {
      lerRascunho(el);
      if (rascunho.preset !== 'custom') Object.assign(rascunho, periodo(rascunho.preset, dados(ctx).ciclos, undefined, rascunho.obras));
      ctx.rerender();
    } else if (e.target.matches('[data-data]')) { lerRascunho(el); rascunho.preset = 'custom'; ctx.rerender(); }
    else if (e.target.matches('[data-multi="obras"]')) { lerRascunho(el); rascunho.etapa = ''; ctx.rerender(); }
    else lerRascunho(el);
  };
  // Lembra se a caixa de filtros está aberta (para não fechar ao redesenhar a tela).
  const alterna = e => {
    const resumo = e.target.closest('[data-caixa-filtros] > summary');
    if (resumo) filtrosAbertos = !resumo.parentElement.open; // o clique acontece antes de abrir/fechar
  };
  el.addEventListener('change', muda);
  el.addEventListener('click', alterna, true);
  return () => { desligarCliques(); el.removeEventListener('change', muda); el.removeEventListener('click', alterna, true); };
}

/** Guarda/restaura quais listas de múltipla escolha estavam abertas antes de redesenhar. */
export function lembrarListasAbertas(el) {
  const abertos = [...el.querySelectorAll('details.multi')].map(d => d.open);
  return () => el.querySelectorAll('details.multi').forEach((d, i) => { if (abertos[i]) d.open = true; });
}
