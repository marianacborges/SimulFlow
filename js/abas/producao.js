// Aba Produção: etapas/frentes de trabalho (Soldagem, Montagem, Pintura…) com responsável, e itens por etapa.
// Rotas: #/producao/etapas · #/producao/ops
import { html, cabecalho, subabas, botao, badge, toast, busca, filtro, alternar, vazio, delegar, progresso } from '../core/ui.js';
import { config } from '../core/config.js';
import { data, hoje } from '../core/util.js';
import { controleEstado, abrirHistorico } from '../componentes/comuns.js';
import { formEtapa } from '../componentes/etapa-form.js';
import { botoesItem, cliquesItem, badgeLaudo } from '../componentes/item-acoes.js';
import { cliquesOP, badgeOP, progressoDaOP } from '../componentes/op-acoes.js';
import { percentual, statusItem, opAtrasada, combinaOP } from '../data/regras.js';

const estado = { quadro: { obra: '', arquivados: false }, ops: { busca: '', status: '', setor: '' } };
let desligar = null;

function obrasDaRaiz(store, raizId) {
  return [raizId, ...store.filtrar('obras', o => o.parentId === raizId).map(o => o.id)];
}

function viewQuadro(ctx) {
  const { store, regra } = ctx;
  const f = estado.quadro;
  const obras = store.filtrar('obras', o => !o.parentId && !o.arquivado && !o.oculto);
  const obraId = obras.some(o => o.id === f.obra) ? f.obra : obras[0]?.id || '';
  const obra = store.obter('obras', obraId);
  const ids = obraId ? obrasDaRaiz(store, obraId) : [];
  const etapas = store.filtrar('etapas', e => ids.includes(e.obraId) && !e.arquivado).sort((a, b) => (a.obraId === obraId ? 0 : 1) - (b.obraId === obraId ? 0 : 1) || a.ordem - b.ordem);
  const itens = store.filtrar('itens', i => i.obraId === obraId && i.arquivado === !!f.arquivados).sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }));
  const extras = store.todos('extras');
  const editarEtapas = regra('editarEtapas');
  const mover = regra('moverItem') && !f.arquivados;
  const coluna = (e, i) => {
    const doGrupo = itens.filter(x => (x.etapaId || '') === (e?.id || ''));
    return html`<section class="column" data-soltar="${e?.id || ''}" aria-label="Etapa ${e?.nome || 'Sem etapa'}">
      <div class="column-head"><div><h2>${e?.nome || 'Sem etapa'} <span class="count-pill">${doGrupo.length}</span></h2>
        <span class="subline">${e ? (e.responsavelNome || 'Sem responsável') + (e.area ? ' · ' + e.area : '') : 'Itens ainda não atribuídos'}</span>
        ${e && e.obraId !== obraId ? html`<span class="subline">${store.obter('obras', e.obraId)?.nome}</span>` : ''}</div>
        ${e && editarEtapas ? html`<div class="toolbar">${botao('', { acao: 'etapa-editar', dados: { id: e.id }, v: 'ghost', tam: 'icon', icone: 'settings', titulo: 'Editar etapa e responsável' })}
          ${botao('', { acao: 'etapa-ordem', dados: { id: e.id, delta: -1 }, v: 'ghost', tam: 'icon', icone: 'arrowLeft', titulo: 'Mover etapa para a esquerda', desab: i === 0 })}
          ${botao('', { acao: 'etapa-ordem', dados: { id: e.id, delta: 1 }, v: 'ghost', tam: 'icon', icone: 'arrowRight', titulo: 'Mover etapa para a direita', desab: i === etapas.length - 1 })}</div>` : ''}</div>
      ${doGrupo.map(it => {
        const op = store.achar('ops', o => o.numero === it.opNumero);
        const pct = percentual(it, extras);
        return html`<article class="item-card" draggable="${mover ? 'true' : 'false'}" data-arrastar="${it.id}">
          <div class="title-row"><h3>${it.codigo}</h3>${badgeLaudo(it)}</div>
          <span class="subline">${[it.descricao, it.serie].filter(Boolean).join(' · ')}</span>
          ${op ? html`<span class="subline">${op.numero} · ${op.faFicha}</span>` : ''}
          <span class="subline">Pedido ${store.obter('pedidos', it.pedidoId)?.numero || '—'} · prazo ${data(it.prazo)}</span>
          ${progresso(pct, `${it.realizado}/${it.previsto} ${it.unidade}`)}
          <span class="subline">${badge(statusItem(it, store.obter('ciclos', it.cicloId), store.todos('ensaios'), hoje(), extras))}</span>
          ${it.laudo?.nota ? html`<span class="subline">${it.laudo.nota}</span>` : ''}
          ${botoesItem(ctx, it, ['avanco', 'mover', 'laudo', 'consumo', 'historico', 'arquivar'])}</article>`;
      })}</section>`;
  };
  return html`${cabecalho('Produção', 'Etapas/frentes de trabalho por obra, com responsável e itens atribuídos.', html`
      ${obraId && editarEtapas ? botao('Nova etapa', { acao: 'etapa-nova', dados: { obra: obraId }, icone: 'plus' }) : ''}
      ${obraId ? botao('Histórico das etapas', { acao: 'etapas-historico', dados: { obra: obraId }, v: 'outline', icone: 'history' }) : ''}`)}
    <div class="filters">${filtro('quadro.obra', obras.map(o => ({ v: o.id, t: o.nome })), obraId, 'Obra em produção')}
      ${alternar('quadro.arquivados', f.arquivados, 'Itens arquivados')}
      ${mover ? html`<span class="filter-count">Arraste os itens entre as etapas ou use o botão mover.</span>` : ''}</div>
    ${obra ? html`<div class="board">${coluna(null, -1)}${etapas.map((e, i) => coluna(e, i))}</div>` : vazio('Nenhuma obra ativa. Cadastre em Projetos/Obras.')}`;
}

function viewOPs(ctx) {
  const { store, regra } = ctx;
  const f = estado.ops;
  const obra = id => store.obter('obras', id);
  const lista = store.filtrar('ops', o => o.status !== 'Concluída' && combinaOP(o, obra(o.obraId), f.busca) && (!f.status || o.status === f.status) && (!f.setor || o.setor === f.setor));
  return html`${cabecalho('Ordens em produção', 'Acompanhe as operações e registre o andamento das ordens.')}
    <div class="filters">${busca('ops.busca', f.busca)}
      ${filtro('ops.status', [{ v: '', t: 'Todos os status' }, ...config.app.statusOP.filter(s => s !== 'Concluída' && s !== 'Atrasada')], f.status, 'Status da operação')}
      ${filtro('ops.setor', [{ v: '', t: 'Todas as etapas' }, 'Usinagem', 'Montagem', 'Fundição', 'Produção', 'Qualidade'], f.setor, 'Setor da OP')}
      ${f.busca || f.status || f.setor ? botao('', { acao: 'limpar', dados: { prefixo: 'ops' }, v: 'ghost', tam: 'icon', icone: 'x', titulo: 'Limpar filtros' }) : ''}
      <span class="filter-count">${lista.length} ordens disponíveis</span></div>
    <div class="cards-grid">${lista.map(o => html`<article class="work-card"><div class="title-row"><a class="code" href="#/pcp/op/${o.id}">${o.numero}</a>${badgeOP(o)}</div>
      <h2>${o.produto}</h2><p>${o.faFicha} · ${obra(o.obraId)?.nome || ''}</p><div class="card-meta"><span>${o.setor}</span><span>${o.responsavel}</span></div>
      ${progressoDaOP(o)}<div class="card-meta"><span>Entrega: ${data(o.prazo)}</span>${opAtrasada(o) ? html`<span class="red">Atrasada</span>` : ''}</div>
      <div class="card-actions">${botao('Registrar produção', { acao: 'op-registro', dados: { id: o.id, tipo: 'produção' }, tam: 'sm', icone: 'play', desab: !regra('registrarProducao') || ['Parada', 'Aguardando material', 'Aguardando qualidade'].includes(o.status) })}
        ${botao('Ocorrência', { acao: 'op-registro', dados: { id: o.id, tipo: 'parada' }, v: 'outline', tam: 'sm', icone: 'pause', desab: !regra('ocorrencia') || o.status === 'Aguardando qualidade' })}
        ${o.status === 'Parada' ? botao('Retomar', { acao: 'op-registro', dados: { id: o.id, tipo: 'retomada' }, v: 'outline', tam: 'sm', icone: 'play', desab: !regra('retomada') }) : ''}</div></article>`)}</div>
    ${lista.length ? '' : vazio()}`;
}

export default {
  id: 'producao',
  titulo: 'Produção',
  onMount(el, ctx) {
    const ctl = controleEstado(estado, ctx);
    const { store, acoes } = ctx;
    desligar = delegar(el, {
      mudanca: ctl.mudanca,
      cliques: {
        ...ctl.cliques, ...cliquesItem(ctx), ...cliquesOP(ctx),
        'etapa-nova': d => formEtapa(ctx, d.obra),
        'etapa-editar': d => { const e = store.obter('etapas', d.id); formEtapa(ctx, e.obraId, e); },
        'etapa-ordem': d => acoes.etapas.reordenarEtapa({ id: d.id, delta: Number(d.delta) }),
        'etapas-historico': d => { const ids = obrasDaRaiz(store, d.obra); abrirHistorico(store, 'Etapas', a => a.entidade === 'etapa' && ids.includes(store.obter('etapas', a.entidadeId)?.obraId) || (a.entidade === 'item' && a.acao === 'Movimentação entre etapas' && a.obraId === d.obra)); },
      },
      soltar: (id, etapaId) => { acoes.itens.moverParaEtapa({ id, etapaId }); toast('Item movido de etapa'); },
    });
  },
  onUnmount() { desligar?.(); },
  render(el, ctx) {
    const [secao = 'etapas'] = ctx.params;
    el.innerHTML = String(html`<main class="page">${subabas([['etapas', 'Itens por etapa', 'factory'], ['ops', 'Ordens de produção', 'clipboard']], secao, 'producao')}${secao === 'ops' ? viewOPs(ctx) : viewQuadro(ctx)}</main>`);
  },
};
