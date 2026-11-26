// Aba Projetos/Obras: obras, sub-projetos, ocultar/arquivar, pedidos (contrato aditivado) e itens.
// Rotas: #/projetos · #/projetos/obra/<id> · #/projetos/pedido/<id> · #/projetos/ops
import { html, cabecalho, subabas, botao, badge, campo, seletor, modal, toast, confirmar, busca, alternar, vazio, rodape, delegar, progresso, filtro } from '../core/ui.js';
import { config } from '../core/config.js';
import { data, combinaTexto, hoje } from '../core/util.js';
import { controleEstado, formCamposExtras, mostrarCamposExtras, abrirHistorico } from '../componentes/comuns.js';
import { formItem, botoesItem, cliquesItem, badgeLaudo } from '../componentes/item-acoes.js';
import { cliquesOP, modalRegistroOP } from '../componentes/op-acoes.js';
import { percentual, statusItem, concluidosDoPedido, pedidosPorData, opAtrasada, progressoOP, atingimento } from '../data/regras.js';

const estado = { lista: { busca: '', arquivados: false, ocultos: false }, obra: { busca: '', arquivados: false }, vinc: { busca: '', risco: '' } };
let desligar = null;
let rolado = '';

function formObra(ctx, obra = null, parentId = null) {
  modal({
    titulo: obra ? 'Editar Projeto/Obra' : parentId ? 'Novo sub-projeto' : 'Novo Projeto/Obra', largo: true,
    descricao: parentId ? `Sub-projeto de ${ctx.store.obter('obras', parentId)?.nome}` : 'Cadastro e identificação.',
    corpo: html`<div class="form-grid">
      ${campo('Nome', html`<input name="nome" required value="${obra?.nome || ''}">`, { obrig: true, full: true })}
      ${campo('Número do contrato', html`<input name="contrato" required value="${obra?.contrato || ''}">`, { obrig: true })}
      ${campo('Cliente', html`<input name="cliente" required value="${obra?.cliente || ''}">`, { obrig: true })}
      ${campo('Responsável', html`<input name="responsavel" required value="${obra?.responsavel || ''}">`, { obrig: true })}
      ${campo('Status geral', seletor('status', config.app.statusObra, obra?.status || 'Em andamento'))}
      ${campo('Data de início', html`<input name="inicio" type="date" value="${obra?.inicio || ''}">`)}
      ${campo('Fim previsto', html`<input name="fim" type="date" value="${obra?.fim || ''}">`)}
      ${campo('Descrição', html`<textarea name="descricao">${obra?.descricao || ''}</textarea>`, { full: true })}
      ${formCamposExtras('obra', obra?.campos)}</div>`,
    onOk: d => { const r = ctx.acoes.obras.salvarObra({ ...d, id: obra?.id, parentId: obra ? undefined : parentId }); toast('Registro salvo'); if (!obra) ctx.navegar(`#/projetos/obra/${r.id}`); },
  });
}

function formPedido(ctx, obraId, pedido = null) {
  modal({
    titulo: pedido ? `Editar pedido ${pedido.numero}` : 'Novo pedido', descricao: 'Contrato aditivado: cada pedido tem sua própria data de entrega e status.',
    corpo: html`<div class="form-grid">
      ${campo('Número do pedido', html`<input name="numero" required value="${pedido?.numero || ''}">`, { obrig: true })}
      ${campo('Data de entrega', html`<input name="dataEntrega" type="date" required value="${pedido?.dataEntrega || ''}">`, { obrig: true })}
      ${campo('Status', seletor('status', config.app.statusPedido, pedido?.status || 'Em andamento'))}
      ${campo('Observações', html`<textarea name="observacoes">${pedido?.observacoes || ''}</textarea>`, { full: true })}
      ${formCamposExtras('pedido', pedido?.campos)}</div>`,
    onOk: d => { ctx.acoes.obras.salvarPedido({ ...d, id: pedido?.id, obraId }); toast('Pedido salvo'); },
  });
}

async function alternarArquivo(ctx, entidade, reg) {
  const nome = reg.nome || reg.numero || reg.codigo;
  const arquivar = !reg.arquivado;
  const extra = entidade === 'obra' ? 'Sub-projetos, pedidos, etapas e itens serão incluídos.' : entidade === 'pedido' ? 'Todos os itens deste pedido serão incluídos.' : '';
  if (await confirmar(`${arquivar ? 'Arquivar' : 'Desarquivar'} ${nome}?`, `${extra} Nenhum dado ou histórico será apagado.`, arquivar ? 'Arquivar' : 'Desarquivar')) {
    ctx.acoes.obras.arquivar({ entidade, id: reg.id, arquivar });
    toast(arquivar ? 'Arquivado' : 'Desarquivado');
  }
}

function resumoObra(store, obra) {
  const ids = [obra.id, ...store.filtrar('obras', o => o.parentId === obra.id).map(o => o.id)];
  const itens = store.filtrar('itens', i => (ids.includes(i.obraId) || ids.includes(i.subprojetoId)) && !i.arquivado);
  return { itens: itens.length, pedidos: store.filtrar('pedidos', p => ids.includes(p.obraId) && !p.arquivado).length, avanco: atingimento(itens, store.todos('extras')) };
}

// ---------------- Lista ----------------

function viewLista(ctx) {
  const { store, regra } = ctx;
  const f = estado.lista;
  const obras = store.filtrar('obras', o => o.arquivado === !!f.arquivados && (f.ocultos || !o.oculto) &&
    combinaTexto(f.busca, [o.nome, o.contrato, o.cliente, o.responsavel, store.obter('obras', o.parentId)?.nome]))
    .sort((a, b) => (a.parentId ? 1 : 0) - (b.parentId ? 1 : 0) || a.nome.localeCompare(b.nome));
  return html`${cabecalho('Projetos/Obras', 'Contratos, sub-projetos, pedidos e itens.', botao('Novo Projeto/Obra', { acao: 'obra-nova', icone: 'plus', desab: !regra('editarObras') }))}
    <div class="filters">${busca('lista.busca', f.busca, 'Buscar obra, contrato, cliente ou responsável...')}
      ${alternar('lista.ocultos', f.ocultos, 'Mostrar ocultos')}${alternar('lista.arquivados', f.arquivados, 'Arquivados')}<span class="filter-count">${obras.length} registros</span></div>
    <div class="cards-grid">${obras.map(o => {
      const r = resumoObra(store, o);
      return html`<article class="work-card"><div class="title-row"><div class="toolbar">${badge(o.status)}${o.demo ? badge('Demonstração', 'neutral') : ''}${o.oculto ? badge('Oculto') : ''}${o.arquivado ? badge('Arquivado') : ''}</div></div>
        <h2>${o.nome}</h2><p>${o.cliente} · ${o.contrato}</p>${o.parentId ? html`<p>Sub-projeto de ${store.obter('obras', o.parentId)?.nome}</p>` : ''}<p>Responsável: ${o.responsavel}</p>
        <div class="card-meta"><span>${r.pedidos} pedidos · ${r.itens} itens</span><strong>${Math.round(r.avanco)}%</strong></div>${progresso(r.avanco)}
        <div class="card-actions"><a class="btn primario sm" href="#/projetos/obra/${o.id}">Abrir projeto</a>
          ${botao(o.oculto ? 'Mostrar' : 'Ocultar', { acao: 'obra-ocultar', dados: { id: o.id }, v: 'outline', tam: 'sm', icone: o.oculto ? 'eye' : 'hidden', desab: !regra('editarObras') })}
          ${botao(o.arquivado ? 'Desarquivar' : 'Arquivar', { acao: 'arquivar', dados: { entidade: 'obra', id: o.id }, v: 'outline', tam: 'sm', icone: o.arquivado ? 'restore' : 'archive', desab: !regra('editarObras') })}</div></article>`;
    })}</div>${obras.length ? '' : vazio()}`;
}

// ---------------- Obra ----------------

function tabelaItens(ctx, itens, { destacar } = {}) {
  const { store } = ctx;
  const extras = store.todos('extras');
  if (!itens.length) return vazio('Nenhum item cadastrado.');
  return html`<div class="table-scroll"><table><thead><tr><th>Item / série</th><th>Pedido</th><th>Etapa</th><th>Avanço</th><th>Prazo</th><th>Laudo</th><th>Status</th><th>Ações</th></tr></thead><tbody>
    ${itens.map(i => {
      const st = statusItem(i, store.obter('ciclos', i.cicloId), store.todos('ensaios'), hoje(), extras);
      return html`<tr class="${i.id === destacar ? 'destacado' : ''}" id="item-${i.id}"><td><strong>${i.codigo}</strong><span class="subline">${[i.descricao, i.serie].filter(Boolean).join(' · ')}</span>${i.subprojetoId ? html`<span class="subline">${store.obter('obras', i.subprojetoId)?.nome}</span>` : ''}${i.opNumero ? html`<span class="subline">${i.opNumero}</span>` : ''}</td>
        <td>${store.obter('pedidos', i.pedidoId)?.numero || '—'}</td><td>${store.obter('etapas', i.etapaId)?.nome || 'Sem etapa'}</td>
        <td>${progresso(percentual(i, extras), `${i.realizado}/${i.previsto} ${i.unidade}`)}</td><td class="${i.prazo < hoje() && st !== 'concluído' ? 'red' : ''}">${data(i.prazo)}</td>
        <td>${badgeLaudo(i)}</td><td>${badge(i.arquivado ? 'Arquivado' : st)}</td><td>${botoesItem(ctx, i, ['editar', 'avanco', 'historico', 'arquivar'])}</td></tr>`;
    })}</tbody></table></div>`;
}

function viewObra(ctx, id) {
  const { store, regra } = ctx;
  const obra = store.obter('obras', id);
  if (!obra) return html`${cabecalho('Obra não encontrada', '')}<a class="btn outline" href="#/projetos">Voltar</a>`;
  const editavel = regra('editarObras') && !obra.arquivado;
  const subs = store.filtrar('obras', o => o.parentId === obra.id);
  const pedidos = pedidosPorData(store.filtrar('pedidos', p => p.obraId === obra.id && p.arquivado === !!estado.obra.arquivados));
  const extras = store.todos('extras');
  const itens = store.filtrar('itens', i => (i.obraId === obra.id || i.subprojetoId === obra.id) && i.arquivado === !!estado.obra.arquivados &&
    combinaTexto(estado.obra.busca, [i.codigo, i.descricao, i.serie, i.opNumero, store.obter('pedidos', i.pedidoId)?.numero]))
    .sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }));
  const pai = store.obter('obras', obra.parentId);
  return html`<p class="muted small"><a class="link" href="#/projetos">Projetos/Obras</a>${pai ? html` / <a class="link" href="#/projetos/obra/${pai.id}">${pai.nome}</a>` : ''} / ${obra.nome}</p>
    ${cabecalho(obra.nome, `${obra.cliente} · Contrato ${obra.contrato}`, html`
      ${botao('Editar', { acao: 'obra-editar', dados: { id: obra.id }, v: 'outline', icone: 'edit', desab: !editavel })}
      ${botao(obra.oculto ? 'Mostrar' : 'Ocultar', { acao: 'obra-ocultar', dados: { id: obra.id }, v: 'outline', icone: obra.oculto ? 'eye' : 'hidden', desab: !regra('editarObras') })}
      ${botao(obra.arquivado ? 'Desarquivar' : 'Arquivar', { acao: 'arquivar', dados: { entidade: 'obra', id: obra.id }, v: 'outline', icone: obra.arquivado ? 'restore' : 'archive', desab: !regra('editarObras') })}
      ${botao('Histórico', { acao: 'obra-historico', dados: { id: obra.id }, v: 'outline', icone: 'history' })}`)}
    <section class="panel"><div class="detail-grid"><div><small>Status geral</small><strong>${obra.status}</strong></div><div><small>Responsável</small><strong>${obra.responsavel}</strong></div>
      <div><small>Período</small><strong>${obra.inicio ? data(obra.inicio) : '—'} a ${obra.fim ? data(obra.fim) : '—'}</strong></div><div><small>Situação</small><strong>${obra.arquivado ? 'Arquivada' : obra.oculto ? 'Oculta' : 'Ativa'}</strong></div>${mostrarCamposExtras('obra', obra.campos)}</div>
      ${obra.descricao ? html`<p class="muted">${obra.descricao}</p>` : ''}
      ${!obra.parentId ? html`<div class="toolbar" style="margin-top:12px"><label class="toggle"><input type="checkbox" data-acao="obra-subprojetos" data-id="${obra.id}"${obra.temSubprojetos ? ' checked' : ''}${editavel ? '' : ' disabled'}> Este projeto possui sub-projetos</label>
        ${obra.temSubprojetos && editavel ? botao('Novo sub-projeto', { acao: 'obra-sub', dados: { id: obra.id }, v: 'outline', tam: 'sm', icone: 'plus' }) : ''}</div>
        ${subs.length ? html`<div class="toolbar" style="margin-top:10px">${subs.map(s => html`<a class="btn outline sm" href="#/projetos/obra/${s.id}">${s.nome}${s.arquivado ? ' (arquivado)' : ''}</a>`)}</div>` : ''}` : ''}
    </section>
    <div class="filters" style="margin-top:16px">${alternar('obra.arquivados', estado.obra.arquivados, 'Mostrar arquivados')}</div>
    <section class="section"><div class="section-title"><h2>Pedidos <span class="count-pill">${pedidos.length}</span></h2>${botao('Novo pedido', { acao: 'pedido-novo', dados: { obra: obra.id }, icone: 'plus', desab: !editavel })}</div>
      <div class="table-wrap">${pedidos.length ? html`<div class="table-scroll"><table><thead><tr><th>Pedido</th><th>Entrega</th><th>Status</th><th>Concluídos</th><th>Ações</th></tr></thead><tbody>
      ${pedidos.map(p => { const c = concluidosDoPedido(store.todos('itens'), p.id, extras); return html`<tr><td><a class="code" href="#/projetos/pedido/${p.id}">${p.numero}</a><span class="subline">${p.observacoes}</span></td>
        <td class="${p.dataEntrega < hoje() && p.status !== 'Concluído' ? 'red' : ''}">${data(p.dataEntrega)}</td><td>${badge(p.arquivado ? 'Arquivado' : p.status)}</td><td>${c.feitos} de ${c.total}</td>
        <td><div class="row-actions">${botao('', { acao: 'pedido-editar', dados: { id: p.id }, v: 'ghost', tam: 'icon', icone: 'edit', titulo: 'Editar ' + p.numero, desab: !regra('editarObras') || p.arquivado })}
          ${botao('', { acao: 'pedido-historico', dados: { id: p.id }, v: 'ghost', tam: 'icon', icone: 'history', titulo: 'Histórico ' + p.numero })}
          ${botao('', { acao: 'arquivar', dados: { entidade: 'pedido', id: p.id }, v: 'ghost', tam: 'icon', icone: p.arquivado ? 'restore' : 'archive', titulo: (p.arquivado ? 'Desarquivar ' : 'Arquivar ') + p.numero, desab: !regra('editarObras') })}</div></td></tr>`; })}
      </tbody></table></div>` : vazio('Nenhum pedido cadastrado.')}</div></section>
    <section class="section"><div class="section-title"><h2>Itens <span class="count-pill">${itens.length}</span></h2>
      <div class="toolbar">${busca('obra.busca', estado.obra.busca, 'Buscar item, série, OP ou pedido...')}${botao('Novo item', { acao: 'item-novo', dados: { obra: obra.parentId ? obra.parentId : obra.id }, icone: 'plus', desab: !regra('editarItens') || obra.arquivado })}</div></div>
      <div class="table-wrap">${tabelaItens(ctx, itens, { destacar: ctx.query?.item })}</div></section>`;
}

function viewPedido(ctx, id) {
  const { store, regra } = ctx;
  const p = store.obter('pedidos', id);
  if (!p) return html`${cabecalho('Pedido não encontrado', '')}<a class="btn outline" href="#/projetos">Voltar</a>`;
  const obra = store.obter('obras', p.obraId);
  const itens = store.filtrar('itens', i => i.pedidoId === p.id).sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }));
  const c = concluidosDoPedido(store.todos('itens'), p.id, store.todos('extras'));
  return html`<p class="muted small"><a class="link" href="#/projetos">Projetos/Obras</a> / <a class="link" href="#/projetos/obra/${obra?.id}">${obra?.nome}</a> / ${p.numero}</p>
    ${cabecalho(`Pedido ${p.numero}`, `Entrega: ${data(p.dataEntrega)} · ${p.status} · ${c.feitos} de ${c.total} itens concluídos`, html`
      ${botao('Editar', { acao: 'pedido-editar', dados: { id: p.id }, v: 'outline', icone: 'edit', desab: !regra('editarObras') || p.arquivado })}
      ${botao(p.arquivado ? 'Desarquivar' : 'Arquivar', { acao: 'arquivar', dados: { entidade: 'pedido', id: p.id }, v: 'outline', icone: p.arquivado ? 'restore' : 'archive', desab: !regra('editarObras') })}
      ${botao('Novo item', { acao: 'item-novo', dados: { obra: obra?.parentId || obra?.id, pedido: p.id }, icone: 'plus', desab: !regra('editarItens') || p.arquivado })}`)}
    ${p.observacoes ? html`<p class="muted" style="margin-bottom:12px">${p.observacoes}</p>` : ''}
    <div class="table-wrap">${tabelaItens(ctx, itens, { destacar: ctx.query?.item })}</div>`;
}

// ---------------- Ordens vinculadas ----------------

function viewVinculadas(ctx) {
  const { store, regra } = ctx;
  const f = estado.vinc;
  const obras = store.filtrar('obras', o => !o.arquivado).filter(o => {
    const ops = store.filtrar('ops', op => op.obraId === o.id);
    return ops.length && ops.some(op => combinaTexto(f.busca, [op.numero, op.faFicha, op.produto, o.nome, op.responsavel, op.status])) && (!f.risco || ops.some(op => opAtrasada(op)));
  });
  return html`${cabecalho('Ordens vinculadas aos projetos', 'Visibilidade dos projetos, prazos e informações para repasse ao cliente.')}
    <div class="filters">${busca('vinc.busca', f.busca)}${filtro('vinc.risco', [{ v: '', t: 'Todos os projetos' }, { v: 'risco', t: 'Com risco de atraso' }], f.risco, 'Risco do projeto')}<span class="filter-count">${obras.length} projetos</span></div>
    <div class="cards-grid">${obras.map(o => {
      const ops = store.filtrar('ops', op => op.obraId === o.id);
      const plan = ops.reduce((s, x) => s + x.planejado, 0), prod = ops.reduce((s, x) => s + x.produzido, 0);
      const risco = ops.some(x => opAtrasada(x));
      return html`<section class="work-card"><div class="title-row"><strong>${o.nome}</strong>${badge(risco ? 'Atenção ao prazo' : 'Dentro do prazo', risco ? 'red' : 'green')}</div>
        <p>${ops.length} ordens vinculadas · ${ops.filter(x => x.status === 'Concluída').length} concluídas</p>
        ${progresso(plan ? prod / plan * 100 : 0, 'Avanço do projeto')}
        ${ops.map(op => html`<div class="alert-item"><div class="alert-copy"><a class="code" href="#/pcp/op/${op.id}">${op.numero} · ${op.faFicha}</a><p>${op.produto} · ${progressoOP(op)}%</p><small class="${opAtrasada(op) ? 'red' : ''}">Entrega ${data(op.prazo)}</small></div>
          ${botao('', { acao: 'op-atualizacao', dados: { id: op.id }, v: 'ghost', tam: 'icon', icone: 'edit', titulo: 'Registrar atualização do projeto', desab: !regra('atualizacaoProjeto') })}</div>`)}</section>`;
    })}</div>${obras.length ? '' : vazio()}`;
}

export default {
  id: 'projetos',
  titulo: 'Projetos/Obras',
  onMount(el, ctx) {
    const ctl = controleEstado(estado, ctx);
    const { store, acoes } = ctx;
    desligar = delegar(el, {
      mudanca: ctl.mudanca,
      cliques: {
        ...ctl.cliques, ...cliquesItem(ctx), ...cliquesOP(ctx),
        'obra-nova': () => formObra(ctx),
        'obra-editar': d => formObra(ctx, store.obter('obras', d.id)),
        'obra-sub': d => formObra(ctx, null, d.id),
        'obra-historico': d => { const o = store.obter('obras', d.id); abrirHistorico(store, o.nome, a => a.obraId === o.id || a.entidadeId === o.id); },
        'obra-ocultar': d => { const o = store.obter('obras', d.id); acoes.obras.ocultarObra({ id: o.id, oculto: !o.oculto }); toast(o.oculto ? 'Obra oculta das listas' : 'Obra visível novamente'); },
        'obra-subprojetos': async (d, el2) => {
          const o = store.obter('obras', d.id);
          const valor = el2.checked;
          if (!valor && store.filtrar('obras', x => x.parentId === o.id).length) {
            if (!(await confirmar('Desativar sub-projetos?', 'Os sub-projetos existentes continuarão visíveis e nenhum dado será apagado.'))) { ctx.rerender(); return; }
          }
          acoes.obras.definirSubprojetos({ id: o.id, valor });
        },
        'arquivar': d => alternarArquivo(ctx, d.entidade, store.obter({ obra: 'obras', pedido: 'pedidos' }[d.entidade], d.id)),
        'pedido-novo': d => formPedido(ctx, d.obra),
        'pedido-editar': d => { const p = store.obter('pedidos', d.id); formPedido(ctx, p.obraId, p); },
        'pedido-historico': d => { const p = store.obter('pedidos', d.id); abrirHistorico(store, p.numero, a => a.entidadeId === p.id); },
        'item-novo': d => formItem(ctx, null, { obraId: d.obra, pedidoId: d.pedido }),
        'op-atualizacao': d => modalRegistroOP(ctx, store.obter('ops', d.id), 'atualização'),
      },
    });
  },
  onUnmount() { desligar?.(); },
  render(el, ctx) {
    const [secao = '', id] = ctx.params;
    const corpo = secao === 'obra' ? viewObra(ctx, id) : secao === 'pedido' ? viewPedido(ctx, id) : secao === 'ops' ? viewVinculadas(ctx) : viewLista(ctx);
    el.innerHTML = String(html`<main class="page">${subabas([['lista', 'Projetos/Obras', 'folder'], ['ops', 'Ordens vinculadas', 'clipboard']], secao === 'ops' ? 'ops' : 'lista', 'projetos')}${corpo}${rodape()}</main>`);
    if (ctx.query?.item && ctx.query.item !== rolado) { rolado = ctx.query.item; el.querySelector(`#item-${CSS.escape(ctx.query.item)}`)?.scrollIntoView({ block: 'center' }); }
  },
};
