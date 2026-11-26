// Aba PCP: Ordens de Produção (OPs) e Frentes/Ações (FAs).
// Rotas: #/pcp/ops · #/pcp/op/<id> · #/pcp/fas · #/pcp/fa/<id>
import { html, cabecalho, subabas, botao, badge, campo, seletor, modal, toast, busca, filtro, vazio, stat, rodape, delegar, progresso } from '../core/ui.js';
import { config } from '../core/config.js';
import { data, dataHora, hora, combinaTexto, hoje } from '../core/util.js';
import { tabelaOPs, cliquesOP, badgeOP, progressoDaOP, formOP } from '../componentes/op-acoes.js';
import { controleEstado, formCamposExtras, mostrarCamposExtras, opcoesUsuarios, abrirHistorico } from '../componentes/comuns.js';
import { progressoOP, opAtrasada, faAtrasada, statusExibidoFA, proximosStatusFA, percentual, statusItem } from '../data/regras.js';
import { baixarCSV } from '../core/exportar.js';

const estado = { op: { busca: '', status: '', setor: '', periodo: '', ordem: 'numero', obra: '', pagina: 1 }, fa: { busca: '', status: '', setor: '', obra: '' } };
let ultimaQuery = '';
let desligar = null;

function aplicarQuery(ctx) {
  const q = JSON.stringify(ctx.query || {});
  if (q === ultimaQuery) return;
  ultimaQuery = q;
  if (ctx.query?.status !== undefined) { estado.op.status = ctx.query.status; estado.op.pagina = 1; }
  if (ctx.query?.fa !== undefined) estado.fa.status = ctx.query.fa;
}

// ---------------- OPs ----------------

function viewOPs(ctx) {
  return html`${cabecalho('Ordens de Produção', 'Planejamento, acompanhamento e rastreabilidade das OPs.',
    botao('Nova ordem de produção', { acao: 'op-nova', icone: 'plus', desab: !ctx.regra('editarOP') }))}
    ${tabelaOPs(ctx, estado.op)}`;
}

function aviso(op) {
  if (op.status === 'Concluída') return 'Ordem concluída e aprovada pela qualidade.';
  if (op.status === 'Aguardando qualidade') return 'Produção concluída. Aguardando inspeção da qualidade.';
  if (op.status === 'Aguardando material') return 'Aguardando providência do Almoxarifado.';
  if (opAtrasada(op)) return 'Prazo ultrapassado. Revisar o planejamento.';
  return 'Ordem disponível para acompanhamento.';
}

function viewOP(ctx, id) {
  const { store, regra } = ctx;
  const op = store.obter('ops', id);
  if (!op) return html`${cabecalho('Ordem não encontrada', 'A ordem solicitada não está disponível.')}<a class="btn outline" href="#/pcp/ops">Voltar às ordens</a>`;
  const obra = store.obter('obras', op.obraId);
  const eventos = store.filtrar('eventos', e => e.opId === op.id).sort((a, b) => b.em.localeCompare(a.em));
  const itens = store.filtrar('itens', i => i.opNumero === op.numero);
  const fas = store.filtrar('fas', f => f.opId === op.id);
  const extras = store.todos('extras');
  const tipo = t => botao(
    { 'produção': 'Registrar produção', 'inspeção': 'Registrar inspeção', 'retomada': 'Liberar produção', 'parada': 'Registrar ocorrência', 'atualização': 'Atualização do projeto' }[t],
    { acao: 'op-registro', dados: { id: op.id, tipo: t }, v: t === 'produção' || t === 'inspeção' ? 'primario' : 'outline', icone: { 'produção': 'play', 'inspeção': 'shield', 'retomada': 'play', 'parada': 'pause', 'atualização': 'edit' }[t],
      desab: { 'produção': !regra('registrarProducao') || ['Concluída', 'Aguardando qualidade', 'Aguardando material', 'Parada'].includes(op.status), 'inspeção': !regra('inspecaoOP'), 'retomada': !regra('retomada'), 'parada': !regra('ocorrencia'), 'atualização': !regra('atualizacaoProjeto') }[t] });
  return html`<p class="muted small"><a class="link" href="#/pcp/ops">Ordens de Produção</a> / ${op.numero}</p>
    ${cabecalho(op.numero, `${op.produto} · ${op.faFicha} · ${obra?.nome || ''}`, html`${botao('Editar ordem', { acao: 'op-editar', dados: { id: op.id }, v: 'outline', icone: 'edit', desab: !regra('editarOP') })}${badgeOP(op)}`)}
    <div class="details-main"><section class="panel">
      <h2>${op.produto}</h2>
      <div class="detail-grid"><div><small>Projeto/Obra</small><strong><a class="link" href="#/projetos/obra/${op.obraId}">${obra?.nome || '—'}</a></strong></div>
        <div><small>Ficha de acompanhamento</small><strong>${op.faFicha}</strong></div><div><small>Setor responsável</small><strong>${op.setor}</strong></div>
        <div><small>Responsável</small><strong>${op.responsavel}</strong></div><div><small>Data de início</small><strong>${data(op.inicio)}</strong></div>
        <div><small>Prazo de entrega</small><strong class="${opAtrasada(op) ? 'red' : ''}">${data(op.prazo)}</strong></div>${mostrarCamposExtras('op', op.campos)}</div>
      <h3>Andamento da produção</h3><div style="margin:8px 0 16px">${progressoDaOP(op)}</div>
      <div class="toolbar">${tipo('produção')}${op.status === 'Aguardando qualidade' ? tipo('inspeção') : ['Parada', 'Aguardando material'].includes(op.status) ? tipo('retomada') : op.status !== 'Concluída' ? tipo('parada') : ''}${tipo('atualização')}</div>
      <h3 style="margin-top:24px">Histórico da ordem</h3>
      ${eventos.length ? html`<div class="activity-list">${eventos.map(e => html`<div class="alert-item"><span class="alert-symbol ${e.prioridade === 'Alta' ? 'amber' : 'blue'}">•</span><div class="alert-copy">
        <strong>${e.tipo} · ${e.origem}</strong><p>${e.descricao}</p>${e.statusAnterior ? html`<p>${e.statusAnterior} → ${e.statusNovo}</p>` : ''}${e.providencia ? html`<p class="green">Providência: ${e.providencia}</p>` : ''}
        <small>${data(e.em)} · ${hora(e.em)} · ${e.ator}</small></div></div>`)}</div>` : vazio()}
    </section><aside class="panel">
      ${stat({ rotulo: 'Conclusão', valor: progressoOP(op) + '%', icone: 'package', rodape: `${op.produzido} de ${op.planejado} unidades produzidas` })}
      <div class="warning-band">${aviso(op)}</div>
      <h3>Itens vinculados</h3>${itens.length ? itens.map(i => html`<p class="small" style="margin:6px 0"><a class="link" href="#/projetos/obra/${i.obraId}?item=${i.id}">${i.codigo}</a> · ${Math.round(percentual(i, extras))}% · ${statusItem(i, store.obter('ciclos', i.cicloId), store.todos('ensaios'), hoje(), extras)}</p>`) : html`<p class="muted small">Nenhum item vinculado.</p>`}
      <h3 style="margin-top:14px">FAs vinculadas</h3>${fas.length ? fas.map(f => html`<p class="small" style="margin:6px 0"><a class="link" href="#/pcp/fa/${f.id}">${f.numero}</a> · ${f.titulo} · ${statusExibidoFA(f)}</p>`) : html`<p class="muted small">Nenhuma FA vinculada.</p>`}
      <h3 style="margin-top:14px">Setores envolvidos</h3><div class="toolbar" style="margin-top:6px">${config.app.areas.map(s => html`<span class="sector-tag">${s}</span>`)}</div>
    </aside></div>`;
}

// ---------------- FAs ----------------

function listaFAs(ctx) {
  const { store } = ctx;
  const f = estado.fa;
  const obra = id => store.obter('obras', id);
  return store.todos('fas').filter(fa => combinaTexto(f.busca, [fa.numero, fa.titulo, fa.descricao, fa.responsavelNome, fa.setorOrigem, fa.setorDestino, statusExibidoFA(fa), obra(fa.obraId)?.nome, store.obter('ops', fa.opId)?.numero]) &&
    (!f.status || (f.status === 'Atrasada' ? faAtrasada(fa) : fa.status === f.status)) &&
    (!f.setor || fa.setorOrigem === f.setor || fa.setorDestino === f.setor) && (!f.obra || fa.obraId === f.obra))
    .sort((a, b) => a.prazo.localeCompare(b.prazo));
}

function viewFAs(ctx) {
  const { store, regra } = ctx;
  const todas = store.todos('fas');
  const lista = listaFAs(ctx);
  const f = estado.fa;
  return html`${cabecalho('Frentes / Ações (FAs)', 'Ligam setores e itens, com responsável, prazo e status próprios.',
    html`${botao('Exportar', { acao: 'fa-csv', v: 'outline', icone: 'download' })}${botao('Nova FA', { acao: 'fa-nova', icone: 'plus', desab: !regra('editarFA') })}`)}
    <div class="stats">${stat({ rotulo: 'Abertas', valor: todas.filter(x => x.status === 'Aberta').length, icone: 'clipboard', rodape: 'Aguardando início', href: '#/pcp/fas?fa=Aberta' })}
      ${stat({ rotulo: 'Em andamento', valor: todas.filter(x => x.status === 'Em andamento').length, icone: 'play', rodape: 'Em execução pelos setores', href: '#/pcp/fas?fa=Em andamento' })}
      ${stat({ rotulo: 'Atrasadas', valor: todas.filter(x => faAtrasada(x)).length, icone: 'alert', cor: 'red', rodape: 'Prazo ultrapassado', href: '#/pcp/fas?fa=Atrasada' })}
      ${stat({ rotulo: 'Concluídas', valor: todas.filter(x => x.status === 'Concluída').length, icone: 'check', cor: 'green', rodape: 'Finalizadas', href: '#/pcp/fas?fa=Concluída' })}</div>
    <section class="table-wrap"><div class="filters" style="padding:12px 16px 0">${busca('fa.busca', f.busca, 'Buscar FA, título, OP, obra, responsável ou setor...')}
      ${filtro('fa.status', [{ v: '', t: 'Todos os status' }, ...config.app.statusFA, 'Atrasada'], f.status, 'Status da FA')}
      ${filtro('fa.setor', [{ v: '', t: 'Todos os setores' }, ...config.app.areas], f.setor, 'Setor')}
      ${filtro('fa.obra', [{ v: '', t: 'Todas as obras' }, ...store.filtrar('obras', o => !o.parentId).map(o => ({ v: o.id, t: o.nome }))], f.obra, 'Obra')}
      ${f.busca || f.status || f.setor || f.obra ? botao('', { acao: 'limpar', dados: { prefixo: 'fa' }, v: 'ghost', tam: 'icon', icone: 'x', titulo: 'Limpar filtros' }) : ''}
      <span class="filter-count">${lista.length} FAs</span></div>
    <div class="table-scroll"><table><thead><tr><th>FA</th><th>Obra / OP</th><th>Setores</th><th>Itens</th><th>Responsável</th><th>Prazo</th><th>Status</th><th></th></tr></thead><tbody>
    ${lista.map(fa => html`<tr><td><a class="code" href="#/pcp/fa/${fa.id}">${fa.numero}</a><span class="subline">${fa.titulo}</span></td>
      <td>${store.obter('obras', fa.obraId)?.nome || '—'}<span class="subline">${store.obter('ops', fa.opId)?.numero || ''}</span></td>
      <td>${fa.setorOrigem} → ${fa.setorDestino}</td><td>${fa.itemIds.map(id => store.obter('itens', id)?.codigo).filter(Boolean).join(', ') || '—'}</td>
      <td>${fa.responsavelNome}</td><td class="${faAtrasada(fa) ? 'red' : ''}">${data(fa.prazo)}</td><td>${badge(statusExibidoFA(fa))}</td>
      <td><div class="row-actions">${botao('Status', { acao: 'fa-status', dados: { id: fa.id }, v: 'outline', tam: 'sm', desab: !regra('statusFA', fa) })}
        ${botao('', { acao: 'fa-editar', dados: { id: fa.id }, v: 'ghost', tam: 'icon', icone: 'edit', titulo: 'Editar ' + fa.numero, desab: !regra('editarFA') || ['Concluída', 'Cancelada'].includes(fa.status) })}
        ${botao('', { acao: 'fa-historico', dados: { id: fa.id }, v: 'ghost', tam: 'icon', icone: 'history', titulo: 'Histórico ' + fa.numero })}</div></td></tr>`)}
    </tbody></table></div>${lista.length ? '' : vazio()}</section>`;
}

function viewFA(ctx, id) {
  const { store, regra } = ctx;
  const fa = store.obter('fas', id);
  if (!fa) return html`${cabecalho('FA não encontrada', '')}<a class="btn outline" href="#/pcp/fas">Voltar às FAs</a>`;
  const extras = store.todos('extras');
  const itens = fa.itemIds.map(i => store.obter('itens', i)).filter(Boolean);
  const op = store.obter('ops', fa.opId);
  const reg = store.filtrar('auditoria', a => a.entidadeId === fa.id).sort((a, b) => b.em.localeCompare(a.em));
  return html`<p class="muted small"><a class="link" href="#/pcp/fas">FAs</a> / ${fa.numero}</p>
    ${cabecalho(`${fa.numero} · ${fa.titulo}`, fa.descricao, html`${botao('Mudar status', { acao: 'fa-status', dados: { id: fa.id }, icone: 'check', desab: !regra('statusFA', fa) })}
      ${botao('Editar', { acao: 'fa-editar', dados: { id: fa.id }, v: 'outline', icone: 'edit', desab: !regra('editarFA') || ['Concluída', 'Cancelada'].includes(fa.status) })}${badge(statusExibidoFA(fa))}`)}
    <div class="details-main"><section class="panel">
      <div class="detail-grid"><div><small>Setor de origem</small><strong>${fa.setorOrigem}</strong></div><div><small>Setor de destino</small><strong>${fa.setorDestino}</strong></div>
        <div><small>Responsável</small><strong>${fa.responsavelNome}</strong></div><div><small>Prazo</small><strong class="${faAtrasada(fa) ? 'red' : ''}">${data(fa.prazo)}</strong></div>
        <div><small>Obra</small><strong>${store.obter('obras', fa.obraId)?.nome || '—'}</strong></div><div><small>OP</small><strong>${op ? html`<a class="link" href="#/pcp/op/${op.id}">${op.numero}</a>` : '—'}</strong></div>
        ${mostrarCamposExtras('fa', fa.campos)}</div>
      <h3>Itens vinculados</h3>
      ${itens.length ? html`<div class="table-scroll"><table><thead><tr><th>Item</th><th>Avanço</th><th>Prazo</th><th>Status</th></tr></thead><tbody>${itens.map(i => html`<tr>
        <td><a class="code" href="#/projetos/obra/${i.obraId}?item=${i.id}">${i.codigo}</a><span class="subline">${i.descricao}</span></td><td>${progresso(percentual(i, extras))}</td><td>${data(i.prazo)}</td>
        <td>${badge(statusItem(i, store.obter('ciclos', i.cicloId), store.todos('ensaios'), hoje(), extras))}</td></tr>`)}</tbody></table></div>` : html`<p class="muted">Nenhum item vinculado.</p>`}
    </section><aside class="panel"><h3>Histórico</h3>
      ${reg.length ? reg.map(a => html`<div class="alert-item"><div class="alert-copy"><strong>${a.acao}</strong>${a.antes?.status ? html`<p>${a.antes.status} → ${a.depois?.status}</p>` : ''}${a.nota ? html`<p>${a.nota}</p>` : ''}<small>${dataHora(a.em)} · ${a.ator}</small></div></div>`) : vazio()}
    </aside></div>`;
}

function formFA(ctx, fa = null, inicial = {}) {
  const { store, acoes } = ctx;
  const obras = store.filtrar('obras', o => !o.parentId && !o.arquivado);
  const obraAtual = fa?.obraId ?? inicial.obraId ?? '';
  const itensDe = obraId => store.filtrar('itens', i => i.obraId === obraId && !i.arquivado);
  const listaItens = obraId => obraId ? html`<div class="check-list">${itensDe(obraId).map(i => html`<label><input type="checkbox" name="itemIds[]" value="${i.id}"${(fa?.itemIds || inicial.itemIds || []).includes(i.id) ? ' checked' : ''}>${i.codigo}${i.descricao ? ' · ' + i.descricao : ''}</label>`)}</div>` : html`<p class="muted small">Selecione uma obra para vincular itens.</p>`;
  const opsDe = obraId => [{ v: '', t: 'Sem OP' }, ...store.todos('ops').filter(o => !obraId || o.obraId === obraId || store.obter('obras', o.obraId)?.parentId === obraId).map(o => ({ v: o.id, t: `${o.numero} · ${o.produto}` }))];
  modal({
    titulo: fa ? `Editar ${fa.numero}` : 'Nova FA', largo: true, descricao: 'Frente/ação entre setores, com itens, responsável, prazo e status.',
    corpo: html`<div class="form-grid">
      ${campo('Título', html`<input name="titulo" required value="${fa?.titulo || ''}">`, { obrig: true, full: true })}
      ${campo('Setor de origem', seletor('setorOrigem', config.app.areas, fa?.setorOrigem || ctx.usuario.area || 'PCP'), { obrig: true })}
      ${campo('Setor de destino', seletor('setorDestino', config.app.areas, fa?.setorDestino || 'Produção'), { obrig: true })}
      ${campo('Projeto/Obra', seletor('obraId', [{ v: '', t: 'Sem obra' }, ...obras.map(o => ({ v: o.id, t: o.nome }))], obraAtual, 'data-obra'))}
      <div data-op>${campo('OP vinculada', seletor('opId', opsDe(obraAtual), fa?.opId || inicial.opId || ''))}</div>
      <fieldset><legend>Itens vinculados</legend><div data-itens>${listaItens(obraAtual)}</div></fieldset>
      ${campo('Responsável (usuário)', seletor('responsavelId', opcoesUsuarios(store, { vazio: 'Outro (informar nome)' }), fa?.responsavelId || ''))}
      ${campo('Nome do responsável', html`<input name="responsavelNome" value="${fa?.responsavelId ? '' : fa?.responsavelNome || ''}" placeholder="Se não for um usuário do sistema">`)}
      ${campo('Prazo', html`<input name="prazo" type="date" required value="${fa?.prazo || ''}">`, { obrig: true })}
      ${campo('Descrição', html`<textarea name="descricao">${fa?.descricao || ''}</textarea>`, { full: true })}
      ${formCamposExtras('fa', fa?.campos)}</div>`,
    aoMontar: form => {
      const sel = form.querySelector('[data-obra]');
      sel.addEventListener('change', () => {
        form.querySelector('[data-itens]').innerHTML = String(listaItens(sel.value));
        form.querySelector('[data-op]').innerHTML = String(campo('OP vinculada', seletor('opId', opsDe(sel.value), '')));
      });
    },
    onOk: d => { acoes.fas.salvarFA({ ...d, id: fa?.id, itemIds: d.itemIds || [] }); toast(fa ? 'FA atualizada' : 'FA cadastrada e setor de destino notificado'); },
  });
}

function modalStatusFA(ctx, fa) {
  const opcoes = proximosStatusFA(fa.status);
  modal({
    titulo: `Status · ${fa.numero}`, descricao: `${fa.titulo} — atual: ${fa.status}`,
    corpo: html`${campo('Novo status', seletor('status', opcoes, opcoes[0]), { obrig: true })}${campo('Observação', html`<textarea name="nota" required placeholder="Obrigatória em toda mudança de status"></textarea>`, { obrig: true })}`,
    rotuloOk: 'Confirmar',
    onOk: d => { ctx.acoes.fas.statusFA({ id: fa.id, ...d }); toast('Status atualizado e setores notificados'); },
  });
}

export default {
  id: 'pcp',
  titulo: 'PCP',
  onMount(el, ctx) {
    const ctl = controleEstado(estado, ctx);
    desligar = delegar(el, {
      mudanca: ctl.mudanca,
      cliques: {
        ...ctl.cliques, ...cliquesOP(ctx),
        'op-csv': () => ctx._csvOPs?.(),
        'fa-nova': () => formFA(ctx),
        'fa-editar': d => formFA(ctx, ctx.store.obter('fas', d.id)),
        'fa-status': d => modalStatusFA(ctx, ctx.store.obter('fas', d.id)),
        'fa-historico': d => { const fa = ctx.store.obter('fas', d.id); abrirHistorico(ctx.store, fa.numero, a => a.entidadeId === fa.id); },
        'fa-csv': () => baixarCSV('fas', listaFAs(ctx).map(fa => ({ FA: fa.numero, Titulo: fa.titulo, Obra: ctx.store.obter('obras', fa.obraId)?.nome || '', OP: ctx.store.obter('ops', fa.opId)?.numero || '', Origem: fa.setorOrigem, Destino: fa.setorDestino, Itens: fa.itemIds.map(i => ctx.store.obter('itens', i)?.codigo).join(', '), Responsavel: fa.responsavelNome, Prazo: fa.prazo, Status: statusExibidoFA(fa) }))),
      },
    });
  },
  onUnmount() { desligar?.(); },
  render(el, ctx) {
    aplicarQuery(ctx);
    const [secao = 'ops', id] = ctx.params;
    const atual = secao === 'op' ? 'ops' : secao === 'fa' ? 'fas' : secao;
    const corpo = secao === 'op' ? viewOP(ctx, id) : secao === 'fas' ? viewFAs(ctx) : secao === 'fa' ? viewFA(ctx, id) : viewOPs(ctx);
    el.innerHTML = String(html`<main class="page">${subabas([['ops', 'Ordens de Produção', 'clipboard'], ['fas', 'FAs (frentes/ações)', 'workflow']], atual, 'pcp')}${corpo}${rodape()}</main>`);
  },
};

export { formOP, formFA };
