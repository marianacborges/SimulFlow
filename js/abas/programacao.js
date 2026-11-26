// Aba Programação: atingimento da programação tri-semanal por obra, itens, efetivo e etapas adicionais.
// Rotas: #/programacao · #/programacao/obra/<id>
import { html, cabecalho, botao, badge, campo, seletor, modal, toast, confirmar, busca, filtro, alternar, vazio, rodape, delegar, progresso, stat, fmtPct } from '../core/ui.js';
import { config } from '../core/config.js';
import { data, hora, hoje, somarDias, numero, combinaTexto, dataHora } from '../core/util.js';
import { controleEstado, opcoesUsuarios, abrirHistorico, rotuloCiclo, nomeUsuario } from '../componentes/comuns.js';
import { formItem, modalAvanco, cliquesItem } from '../componentes/item-acoes.js';
import { formEtapa } from '../componentes/etapa-form.js';
import { formExtra, formAtualizarExtra } from '../componentes/extra-form.js';
import { percentual, esperado, statusItem, motivosBloqueio, atingimento, diasAtraso, gargalo, itemAtrasado, resumoRetrabalho, STATUS_ITEM, TIPOS_EXTRA, observacaoObrigatoria } from '../data/regras.js';
import { relatorioPDF, baixarExcel } from '../core/exportar.js';

const estado = { geral: { busca: '', arquivadas: false }, obra: { ciclo: '', arquivados: false, busca: '', status: '', turno: 'manhã' } };
let obraAnterior = '';
let desligar = null;

function cicloAtual(store, obraId) {
  const d = hoje();
  const ciclos = store.filtrar('ciclos', c => c.obraId === obraId).sort((a, b) => b.inicio.localeCompare(a.inicio));
  return ciclos.find(c => c.inicio <= d && c.fim >= d && c.status !== 'encerrado') || ciclos[0];
}

function resumo(store, obraId) {
  const ciclo = cicloAtual(store, obraId);
  const extras = store.todos('extras'), ensaios = store.todos('ensaios');
  const itens = store.filtrar('itens', i => i.obraId === obraId && !i.arquivado && (!ciclo || i.cicloId === ciclo.id));
  const atrasados = itens.filter(i => itemAtrasado(i, ciclo, extras));
  const bloqueados = itens.filter(i => motivosBloqueio(i, ensaios, extras).length);
  const gargalos = ensaios.filter(e => e.obraId === obraId && gargalo(e, store.obter('tiposEnsaio', e.tipoId)));
  return { ciclo, itens, atrasados, bloqueados, gargalos, valor: atingimento(itens, extras), risco: atrasados.length + bloqueados.length };
}

// ---------------- Visão geral ----------------

function viewGeral(ctx) {
  const { store, regra } = ctx;
  const f = estado.geral;
  const extras = store.todos('extras'), ensaios = store.todos('ensaios');
  const obras = store.filtrar('obras', o => !o.parentId && o.arquivado === !!f.arquivadas && o.status !== 'Concluído' && !o.oculto && combinaTexto(f.busca, [o.nome, o.contrato, o.cliente]));
  const visiveis = store.filtrar('itens', i => !i.arquivado && i.cicloId && !store.obter('obras', i.obraId)?.arquivado);
  const bloqueados = visiveis.filter(i => motivosBloqueio(i, ensaios, extras).length);
  const resumos = Object.fromEntries(obras.map(o => [o.id, resumo(store, o.id)]));
  return html`${cabecalho('Programação', 'Atingimento da programação tri-semanal por obra.', regra('editarObras') ? html`<a class="btn primario" href="#/projetos">Cadastrar obra</a>` : '')}
    <div class="status-strip"><span><i class="live-dot"></i> Atualizado às ${hora(new Date().toISOString())}</span>${botao('Histórico', { acao: 'prog-historico', v: 'ghost', tam: 'sm', icone: 'history' })}</div>
    <div class="stats">${stat({ rotulo: 'Obras ativas', valor: obras.length, icone: 'target', rodape: 'Programação por contrato' })}
      ${stat({ rotulo: 'Itens em atraso', valor: visiveis.filter(i => itemAtrasado(i, store.obter('ciclos', i.cicloId), extras)).length, icone: 'alert', cor: 'amber', rodape: 'Prazo ou avanço abaixo do esperado' })}
      ${stat({ rotulo: 'Itens bloqueados', valor: bloqueados.length, icone: 'lock', cor: 'red', rodape: 'Dependências de ensaios' })}
      ${stat({ rotulo: 'Ensaios em gargalo', valor: ensaios.filter(e => gargalo(e, store.obter('tiposEnsaio', e.tipoId))).length, icone: 'flask', cor: 'cyan', rodape: 'Somente limites configurados' })}</div>
    <div class="filters">${busca('geral.busca', f.busca, 'Buscar obra, contrato ou cliente…')}${alternar('geral.arquivadas', f.arquivadas, 'Arquivadas')}</div>
    <div class="table-wrap"><div class="table-scroll"><table><thead><tr><th>Obra / cliente</th><th>Atingimento / meta</th><th>Em atraso</th><th>Bloqueados</th><th>Gargalos</th><th></th></tr></thead><tbody>
      ${obras.sort((a, b) => resumos[b.id].risco - resumos[a.id].risco).map(o => {
        const r = resumos[o.id];
        return html`<tr><td><a class="code" href="#/programacao/obra/${o.id}">${o.nome}</a><span class="subline">${o.cliente} · ${o.contrato}</span>${o.demo ? badge('Demonstração', 'neutral') : ''}</td>
          <td>${progresso(r.valor, `Meta ${r.ciclo ? numero(r.ciclo.meta) + '%' : '—'}${r.ciclo ? ' · ' + data(r.ciclo.fim) : ' · Sem ciclo'}`)}</td>
          <td class="${r.atrasados.length ? 'amber' : ''}">${r.atrasados.length}</td><td class="${r.bloqueados.length ? 'red' : ''}">${r.bloqueados.length}</td><td>${r.gargalos.length}</td>
          <td><div class="row-actions"><a class="btn ghost icon" href="#/programacao/obra/${o.id}" title="Abrir obra" aria-label="Abrir ${o.nome}">›</a>
            ${regra('arquivarProgramacao') ? botao('', { acao: 'prog-arquivar-obra', dados: { id: o.id }, v: 'ghost', tam: 'icon', icone: o.arquivado ? 'restore' : 'archive', titulo: o.arquivado ? 'Restaurar obra' : 'Arquivar obra' }) : ''}</div></td></tr>`;
      })}</tbody></table></div>${obras.length ? '' : vazio('Nenhuma obra encontrada.')}</div>
    <section class="section"><div class="section-title"><h2>Laudos e bloqueios</h2>${ctx.pode('qualidade') ? html`<a class="btn outline" href="#/qualidade/ensaios">Ensaios</a>` : ''}</div>
      <div class="panel">${bloqueados.slice(0, 8).map(i => html`<div class="alert-item"><span class="alert-symbol red">!</span><div class="alert-copy"><strong>${i.codigo} · ${store.obter('obras', i.obraId)?.nome}</strong>${motivosBloqueio(i, ensaios, extras).map(m => html`<p>${m}</p>`)}</div></div>`)}
      ${bloqueados.length ? '' : vazio('Nenhum item bloqueado.')}</div></section>
    ${alertas(ctx, null)}`;
}

function alertas(ctx, obraId) {
  const { store, usuario } = ctx;
  const lista = store.filtrar('eventos', e => !e.lida && (e.ensaioId || e.itemId) && (!obraId || e.obraId === obraId) && (!e.destinatarioId || e.destinatarioId === usuario.id || ctx.host || ctx.pode('notificacoes')));
  if (!lista.length) return '';
  return html`<section class="section"><h2>Notificações internas</h2><div class="panel">${lista.map(e => html`<div class="alert-item"><span class="alert-symbol red">!</span><div class="alert-copy"><strong>${e.descricao}</strong><p>${dataHora(e.em)}</p></div>
    ${botao('Lida', { acao: 'alerta-lido', dados: { id: e.id }, v: 'ghost', tam: 'sm' })}</div>`)}</div></section>`;
}

// ---------------- Obra ----------------

function viewObra(ctx, id) {
  const { store, regra, usuario } = ctx;
  const obra = store.obter('obras', id);
  if (!obra) return html`${cabecalho('Obra não encontrada', '')}<a class="btn outline" href="#/programacao">Obras</a>`;
  if (obraAnterior !== id) { obraAnterior = id; estado.obra.ciclo = ''; }
  const f = estado.obra;
  const extras = store.todos('extras'), ensaios = store.todos('ensaios');
  const ciclos = store.filtrar('ciclos', c => c.obraId === id).sort((a, b) => b.inicio.localeCompare(a.inicio));
  const ciclo = ciclos.find(c => c.id === f.ciclo) || (f.ciclo === 'sem' ? null : cicloAtual(store, id));
  const todos = store.filtrar('itens', i => i.obraId === id && i.arquivado === !!f.arquivados && (ciclo ? i.cicloId === ciclo.id : !i.cicloId));
  const status = i => statusItem(i, ciclo, ensaios, hoje(), extras);
  const linhas = todos.filter(i => combinaTexto(f.busca, [i.codigo, i.descricao, store.obter('etapas', i.etapaId)?.nome]) && (!f.status || status(i) === f.status))
    .sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }));
  const ids = [id, ...store.filtrar('obras', o => o.parentId === id).map(o => o.id)];
  const etapas = store.filtrar('etapas', e => ids.includes(e.obraId) && !e.arquivado).sort((a, b) => a.ordem - b.ordem);
  const ativa = !obra.arquivado;
  const retrabalhoAberto = extras.filter(e => todos.some(i => i.id === e.itemId) && e.tipo === 'retrabalho' && ['aberta', 'em andamento'].includes(e.status)).length;
  return html`<p class="muted small"><a class="link" href="#/programacao">Programação</a> / ${obra.nome}</p>
    ${cabecalho(obra.nome, `${obra.cliente} · Contrato ${obra.contrato}`, html`<a class="btn outline" href="#/programacao">Obras</a>
      ${botao('PDF', { acao: 'prog-pdf', dados: { id }, v: 'outline', icone: 'file' })}${botao('Excel', { acao: 'prog-excel', dados: { id }, v: 'outline', icone: 'sheet' })}
      ${botao('Histórico', { acao: 'prog-historico', dados: { obra: id }, v: 'outline', icone: 'history' })}`)}
    <div class="filters"><label class="field" style="min-width:260px"><span class="field-label">Ciclo</span>${filtro('obra.ciclo', [...ciclos.map(c => ({ v: c.id, t: rotuloCiclo(c) })), { v: 'sem', t: 'Itens sem ciclo' }], ciclo?.id || 'sem', 'Ciclo da obra')}</label>
      ${alternar('obra.arquivados', f.arquivados, 'Itens arquivados')}
      ${ativa ? html`${botao('Ciclo', { acao: 'ciclo-novo', dados: { obra: id }, v: 'outline', icone: 'plus', desab: !regra('criarCiclo') })}
        ${ciclo ? botao('Editar ciclo', { acao: 'ciclo-editar', dados: { id: ciclo.id }, v: 'outline', icone: 'edit', desab: !regra('criarCiclo') }) : ''}
        ${botao('Etapa', { acao: 'etapa-nova', dados: { obra: id }, v: 'outline', icone: 'plus', desab: !regra('editarEtapas') })}
        ${botao('Item', { acao: 'prog-item-novo', dados: { obra: id, ciclo: ciclo?.id || '' }, icone: 'plus', desab: !regra('editarItens') || !etapas.length })}` : ''}</div>
    <div class="stats">${stat({ rotulo: 'Atingimento', valor: fmtPct(Math.round(atingimento(todos, extras) * 10) / 10), icone: 'target', rodape: `Meta do ciclo: ${ciclo ? numero(ciclo.meta) + '%' : '—'}` })}
      ${stat({ rotulo: 'Em atraso', valor: todos.filter(i => itemAtrasado(i, ciclo, extras)).length, icone: 'alert', cor: 'amber', rodape: 'Prazo ou avanço abaixo do esperado' })}
      ${stat({ rotulo: 'Bloqueados', valor: todos.filter(i => motivosBloqueio(i, ensaios, extras).length).length, icone: 'lock', cor: 'red', rodape: 'Motivos relacionados abaixo' })}
      ${stat({ rotulo: 'Avanço previsto cumprido', valor: todos.filter(i => ciclo && percentual(i, extras) >= (esperado(i, ciclo) ?? 0)).length, icone: 'check', cor: 'green', rodape: `${todos.length} itens no ciclo` })}</div>
    <div class="status-strip"><span><strong>Retrabalho em aberto</strong> ${retrabalhoAberto}</span><span class="muted">Programação original preservada</span></div>
    <section class="section"><h2>Itens críticos</h2><div class="critical" style="margin-top:10px">${todos.filter(i => percentual(i, extras) < 100).sort((a, b) => diasAtraso(b) - diasAtraso(a)).slice(0, 3)
      .map(i => html`<article><strong>${i.codigo}</strong><span class="amber">${diasAtraso(i)} ${diasAtraso(i) === 1 ? 'dia' : 'dias'} de atraso</span><span>${numero(percentual(i, extras))}% realizado</span></article>`)}</div></section>
    <div class="filters" style="margin-top:20px">${busca('obra.busca', f.busca, 'Buscar item ou etapa…')}${filtro('obra.status', [{ v: '', t: 'Todos os status' }, ...['bloqueado', 'concluído', 'em atraso', 'em andamento', 'não iniciado']], f.status, 'Status do item')}</div>
    <div class="table-wrap"><div class="table-scroll"><table><thead><tr><th>Item / etapa</th><th>Realizado / previsto</th><th>Avanço / esperado</th><th>Prazo</th><th>Status / motivo</th><th>Ações</th></tr></thead><tbody>
      ${linhas.map(i => {
        const etapa = store.obter('etapas', i.etapaId);
        const esp = esperado(i, ciclo);
        const podeAtualizar = ativa && !i.arquivado && regra('atualizarItem', etapa);
        return html`<tr><td><strong>${i.codigo}</strong><span class="subline">${etapa?.nome || 'Sem etapa'}</span>${i.subprojetoId ? html`<span class="subline">${store.obter('obras', i.subprojetoId)?.nome}</span>` : ''}</td>
          <td>${numero(i.realizado, 3)} / ${numero(i.previsto, 3)} ${i.unidade}</td>
          <td>${progresso(percentual(i, extras), `Esperado ${esp === null ? '—' : numero(esp) + '%'}`)}</td><td>${data(i.prazo)}</td>
          <td>${badge(status(i))}${motivosBloqueio(i, ensaios, extras).map(m => html`<span class="subline">${m}</span>`)}</td>
          <td><div class="row-actions">${podeAtualizar ? botao('', { acao: 'item-avanco', dados: { id: i.id }, v: 'outline', tam: 'icon', icone: 'edit', titulo: `Atualizar ${i.codigo}` }) : ''}
            ${botao('', { acao: 'item-historico', dados: { id: i.id }, v: 'ghost', tam: 'icon', icone: 'history', titulo: `Histórico ${i.codigo}` })}
            ${regra('moverCiclo') && ativa && !i.arquivado ? botao('', { acao: 'prog-mover-ciclo', dados: { id: i.id }, v: 'ghost', tam: 'icon', icone: 'move', titulo: 'Mover ciclo' }) : ''}
            ${regra('arquivarProgramacao') && ativa ? botao('', { acao: 'item-arquivar', dados: { id: i.id }, v: 'ghost', tam: 'icon', icone: i.arquivado ? 'restore' : 'archive', titulo: i.arquivado ? 'Restaurar item' : 'Arquivar item' }) : ''}</div></td></tr>
          ${extrasDoItem(ctx, i)}`;
      })}</tbody></table></div>${linhas.length ? '' : vazio('Nenhum item neste ciclo.')}</div>
    <section class="section"><div class="section-title"><h2>Efetivo por etapa</h2><div class="toolbar">${filtro('obra.turno', config.app.turnos, f.turno, 'Turno do efetivo')}
      ${ativa ? botao('Registrar efetivo', { acao: 'efetivo-novo', dados: { obra: id }, v: 'outline', icone: 'users', desab: !etapas.some(e => regra('efetivo', e)) }) : ''}</div></div>
      <div class="critical">${etapas.map(e => {
        const reg = store.achar('efetivo', x => x.etapaId === e.id && x.turno === f.turno && x.dia === hoje());
        return html`<article><strong>${e.nome}</strong><span>${reg ? `${reg.disponiveis} disponíveis / ${reg.previstos} previstos` : 'Sem registro neste turno'}</span>
          ${reg ? html`<span class="${reg.disponiveis < reg.previstos ? 'red' : 'green'}">Diferença: ${reg.disponiveis - reg.previstos}</span>` : ''}<span class="subline">${e.responsavelNome || 'Sem responsável'}</span></article>`;
      })}${etapas.length ? '' : vazio('Nenhuma etapa cadastrada.')}</div></section>
    ${alertas(ctx, id)}`;
}

function extrasDoItem(ctx, item) {
  const { store, regra, usuario } = ctx;
  const lista = store.filtrar('extras', e => e.itemId === item.id);
  const podeCriar = regra('criarExtra') && !item.arquivado && !store.obter('obras', item.obraId)?.arquivado;
  if (!lista.length && !podeCriar) return '';
  return html`<tr class="sub"><td colspan="6">${lista.map(e => html`<div class="extra-box"><div class="title-row"><strong>${e.tipo} · ${numero(e.realizado, 3)} / ${numero(e.previsto, 3)} ${item.unidade}</strong>${badge(e.status)}</div>
      <span>${e.motivo}</span><span class="subline">Prazo: ${data(e.prazo)} · ${nomeUsuario(store, e.responsavelId)}${e.cancelamento ? ' · Cancelamento: ' + e.cancelamento : ''}</span>
      ${e.analise ? html`<span class="subline">Análise de causa: ${e.analise}</span>` : ''}
      <div class="toolbar">${e.status !== 'cancelada' && !item.arquivado && regra('atualizarExtra', e) ? html`${botao('Atualizar etapa adicional', { acao: 'extra-atualizar', dados: { id: e.id }, v: 'outline', tam: 'sm' })}
        ${botao('', { acao: 'extra-cancelar', dados: { id: e.id }, v: 'ghost', tam: 'icon', icone: 'ban', titulo: 'Cancelar etapa adicional' })}` : ''}
        ${botao('', { acao: 'extra-historico', dados: { id: e.id }, v: 'ghost', tam: 'icon', icone: 'history', titulo: 'Histórico da etapa adicional' })}</div></div>`)}
    ${podeCriar ? botao('Criar etapa adicional', { acao: 'extra-nova', dados: { item: item.id }, v: 'outline', tam: 'sm', icone: 'plus' }) : ''}</td></tr>`;
}

// ---------------- Formulários ----------------

function formCiclo(ctx, obraId, ciclo = null) {
  const inicio = ciclo?.inicio || hoje();
  modal({
    titulo: ciclo ? 'Editar ciclo' : 'Novo ciclo tri-semanal', descricao: ctx.store.obter('obras', obraId)?.nome,
    corpo: html`<div class="form-grid">${campo('Início', html`<input name="inicio" type="date" required value="${inicio}" data-inicio>`, { obrig: true })}
      ${campo('Fim', html`<input name="fim" type="date" required value="${ciclo?.fim || somarDias(inicio, 21)}" data-fim>`, { obrig: true, ajuda: 'Padrão: início + 21 dias.' })}
      ${campo('Meta (%)', html`<input name="meta" type="number" min="0" max="100" step="any" required value="${ciclo?.meta ?? 80}">`, { obrig: true })}
      ${campo('Situação', seletor('status', ['planejado', 'em andamento', 'encerrado'], ciclo?.status || 'planejado'))}
      ${campo('Justificativa de ajuste de duração', html`<textarea name="justificativa">${ciclo?.justificativa || ''}</textarea>`, { full: true, ajuda: 'Obrigatória se o ciclo não tiver 21 dias.' })}</div>`,
    aoMontar: form => form.querySelector('[data-inicio]').addEventListener('change', e => { if (e.target.value) form.querySelector('[data-fim]').value = somarDias(e.target.value, 21); }),
    onOk: d => { const r = ctx.acoes.programacao.salvarCiclo({ ...d, id: ciclo?.id, obraId }); estado.obra.ciclo = r.id; toast('Ciclo salvo'); },
  });
}

function formMoverCiclo(ctx, item) {
  const ciclos = ctx.store.filtrar('ciclos', c => c.obraId === item.obraId && c.status !== 'encerrado');
  modal({
    titulo: `Mover item de ciclo · ${item.codigo}`,
    corpo: html`<div class="form-grid">${campo('Ciclo', seletor('cicloId', [{ v: '', t: 'Selecione' }, ...ciclos.map(c => ({ v: c.id, t: rotuloCiclo(c) }))], item.cicloId, 'required'), { obrig: true })}
      ${campo('Data prevista', html`<input name="prazo" type="date" required value="${item.prazo}">`, { obrig: true })}
      ${campo('Justificativa', html`<textarea name="nota" required></textarea>`, { obrig: true, full: true })}</div>`,
    onOk: d => { ctx.acoes.itens.moverCiclo({ id: item.id, ...d }); toast('Item movido de ciclo'); },
  });
}

function formEfetivo(ctx, obraId) {
  const { store, regra } = ctx;
  const ids = [obraId, ...store.filtrar('obras', o => o.parentId === obraId).map(o => o.id)];
  const etapas = store.filtrar('etapas', e => ids.includes(e.obraId) && !e.arquivado && regra('efetivo', e));
  const politica = store.config.politicas.efetivo;
  modal({
    titulo: 'Efetivo do turno', descricao: store.obter('obras', obraId)?.nome,
    corpo: html`<div class="form-grid">${campo('Etapa', seletor('etapaId', [{ v: '', t: 'Selecione' }, ...etapas.map(e => ({ v: e.id, t: e.nome }))], '', 'required'), { obrig: true })}
      ${campo('Data', html`<input name="dia" type="date" required value="${hoje()}">`, { obrig: true })}
      ${campo('Profissionais previstos', html`<input name="previstos" type="number" min="0" step="1" required>`, { obrig: true })}
      ${campo('Profissionais disponíveis', html`<input name="disponiveis" type="number" min="0" step="1" required>`, { obrig: true })}
      ${campo('Turno', seletor('turno', config.app.turnos, estado.obra.turno), { obrig: true })}
      <label class="toggle" style="grid-column:1/-1"><input type="checkbox" name="semObservacao"> Não vou deixar observação</label>
      ${campo(politica === 'sempre' ? 'Observação obrigatória' : 'Observação', html`<textarea name="nota" data-obs ${politica === 'sempre' ? 'required' : ''}></textarea>`, { full: true, ajuda: politica === 'condicional' ? 'Obrigatória em redução do efetivo ou etapa com item atrasado.' : '' })}</div>`,
    aoMontar: form => form.querySelector('[name=semObservacao]').addEventListener('change', e => { form.querySelector('[data-obs]').disabled = e.target.checked; }),
    onOk: d => { ctx.acoes.programacao.registrarEfetivo(d); toast('Efetivo registrado'); },
  });
}

// ---------------- Exportações ----------------

function dadosRelatorio(ctx, obraId) {
  const { store } = ctx;
  const extras = store.todos('extras'), ensaios = store.todos('ensaios');
  const itens = store.filtrar('itens', i => i.obraId === obraId && !i.arquivado);
  const linhas = itens.map(i => ({
    Item: i.codigo, Descrição: i.descricao, Etapa: store.obter('etapas', i.etapaId)?.nome || '', Previsto: i.previsto, Realizado: i.realizado, Unidade: i.unidade,
    'Avanço (%)': Math.round(percentual(i, extras) * 10) / 10, Prazo: i.prazo, Status: statusItem(i, store.obter('ciclos', i.cicloId), ensaios, hoje(), extras), Bloqueio: motivosBloqueio(i, ensaios, extras).join('; '),
  }));
  const extrasObra = extras.filter(e => itens.some(i => i.id === e.itemId));
  const rt = resumoRetrabalho(extrasObra);
  const linhasExtras = extrasObra.map(e => ({ Item: store.obter('itens', e.itemId)?.codigo || '', Tipo: e.tipo, Motivo: e.motivo, Previsto: e.previsto, Realizado: e.realizado, Status: e.status, Prazo: e.prazo, 'Análise de causa': e.analise }));
  const linhasEnsaios = ensaios.filter(e => e.obraId === obraId).map(e => ({ Laudo: e.codigo, Tipo: store.obter('tiposEnsaio', e.tipoId)?.nome || '', Item: store.obter('itens', e.itemId)?.codigo || '', Status: e.status, Observação: e.pendencia, Desde: e.statusDesde }));
  return { itens, linhas, linhasExtras, linhasEnsaios, rt, extras };
}

function exportar(ctx, obraId, formato) {
  const obra = ctx.store.obter('obras', obraId);
  const r = dadosRelatorio(ctx, obraId);
  const arquivo = 'SimulFlow-' + String(obra.contrato).replace(/[^a-z0-9_-]/gi, '-');
  if (formato === 'excel') {
    baixarExcel(arquivo, [{ nome: 'Programação', linhas: r.linhas }, { nome: 'Ensaios', linhas: r.linhasEnsaios }, { nome: 'Retrabalho e NC', linhas: r.linhasExtras },
      { nome: 'Obra', linhas: [['Obra', obra.nome], ['Contrato', obra.contrato], ['Cliente', obra.cliente], ['Atingimento (%)', Math.round(atingimento(r.itens, r.extras) * 10) / 10], ['Gerado em', new Date().toLocaleString('pt-BR')], ['Etapas adicionais', r.rt.total], ['Retrabalho em aberto', r.rt.abertas], ['Tempo médio de conclusão (h)', Math.round(r.rt.mediaHoras * 10) / 10], ...r.rt.motivos].map(([Campo, Valor]) => ({ Campo, Valor })) }]);
  } else {
    relatorioPDF({
      titulo: 'SimulFlow | ' + obra.nome, subtitulo: `Contrato: ${obra.contrato} | Cliente: ${obra.cliente}`, arquivo,
      cabecalho: [`Gerado em ${new Date().toLocaleString('pt-BR')} por ${ctx.usuario.nome}`, `Atingimento: ${numero(atingimento(r.itens, r.extras))}%`],
      secoes: [
        { titulo: 'Programação', linhas: r.linhas.map(l => `${l.Item} - ${l.Etapa} | ${l.Realizado}/${l.Previsto} ${l.Unidade} | ${l['Avanço (%)']}% | ${data(l.Prazo)} | ${l.Status}${l.Bloqueio ? '\n' + l.Bloqueio : ''}`) },
        { titulo: 'Ensaios', linhas: r.linhasEnsaios.map(e => `${e.Laudo} | ${e.Tipo} | ${e.Item} | ${e.Status}${e.Observação ? ' | ' + e.Observação : ''}`) },
        { titulo: 'Retrabalho e não conformidades', linhas: [`Etapas adicionais: ${r.rt.total} | Em aberto: ${r.rt.abertas} | Tempo médio de conclusão: ${numero(r.rt.mediaHoras)} h`, ...r.linhasExtras.map(e => `${e.Item} | ${e.Tipo} | ${e.Realizado}/${e.Previsto} | ${e.Status} | ${e.Motivo}`), ...r.rt.motivos.map(([m, n]) => `${n} - ${m}`)] },
      ],
    });
  }
}

export default {
  id: 'programacao',
  titulo: 'Programação',
  onMount(el, ctx) {
    const ctl = controleEstado(estado, ctx);
    const { store, acoes } = ctx;
    const itensClique = cliquesItem(ctx);
    desligar = delegar(el, {
      mudanca: ctl.mudanca,
      cliques: {
        ...ctl.cliques, ...itensClique,
        'item-avanco': d => modalAvanco(ctx, store.obter('itens', d.id)),
        'prog-historico': d => abrirHistorico(store, d.obra ? store.obter('obras', d.obra).nome : 'Programação', a => ['item', 'ciclo', 'ensaio', 'extra', 'etapa'].includes(a.entidade) && (!d.obra || a.obraId === d.obra)),
        'prog-arquivar-obra': async d => {
          const o = store.obter('obras', d.id);
          if (await confirmar(`${o.arquivado ? 'Restaurar' : 'Arquivar'} ${o.nome}?`, 'Os registros e o histórico serão preservados. Todos os sub-projetos, pedidos, etapas e itens acompanham a obra.')) acoes.obras.arquivar({ entidade: 'obra', id: o.id, arquivar: !o.arquivado });
        },
        'prog-pdf': d => exportar(ctx, d.id, 'pdf'),
        'prog-excel': d => exportar(ctx, d.id, 'excel'),
        'ciclo-novo': d => formCiclo(ctx, d.obra),
        'ciclo-editar': d => { const c = store.obter('ciclos', d.id); formCiclo(ctx, c.obraId, c); },
        'etapa-nova': d => formEtapa(ctx, d.obra),
        'prog-item-novo': d => formItem(ctx, null, { obraId: d.obra, cicloId: d.ciclo || '' }),
        'prog-mover-ciclo': d => formMoverCiclo(ctx, store.obter('itens', d.id)),
        'efetivo-novo': d => formEfetivo(ctx, d.obra),
        'extra-nova': d => formExtra(ctx, store.obter('itens', d.item)),
        'extra-atualizar': d => formAtualizarExtra(ctx, store.obter('extras', d.id)),
        'extra-cancelar': d => modal({ titulo: 'Cancelar etapa adicional?', descricao: 'A etapa permanece no histórico e deixa de compor o atingimento.', corpo: campo('Justificativa', html`<textarea name="nota" required></textarea>`, { obrig: true }), rotuloOk: 'Confirmar cancelamento', onOk: v => { acoes.programacao.cancelarExtra({ id: d.id, nota: v.nota }); toast('Etapa adicional cancelada'); } }),
        'extra-historico': d => abrirHistorico(store, 'Etapa adicional', a => a.entidadeId === d.id),
        'alerta-lido': d => acoes.eventos.marcarLida({ id: d.id }),
      },
    });
  },
  onUnmount() { desligar?.(); },
  render(el, ctx) {
    const [secao, id] = ctx.params;
    el.innerHTML = String(html`<main class="page">${secao === 'obra' ? viewObra(ctx, id) : viewGeral(ctx)}${rodape()}</main>`);
  },
};

