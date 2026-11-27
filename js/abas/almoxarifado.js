// Aba Almoxarifado: materiais, movimentações de estoque, solicitações da produção e consumo por item.
import { html, cabecalho, botao, badge, campo, seletor, modal, toast, busca, filtro, vazio, delegar, stat } from '../core/ui.js';
import { config } from '../core/config.js';
import { data, combinaTexto, unicos, numero } from '../core/util.js';
import { controleEstado, formCamposExtras } from '../componentes/comuns.js';
import { botoesItem, cliquesItem, consumoResumo } from '../componentes/item-acoes.js';
import { cliquesOP } from '../componentes/op-acoes.js';
import { camposBuscaOP, percentual } from '../data/regras.js';
import { baixarCSV } from '../core/exportar.js';

const estado = { mat: { busca: '', categoria: '', baixo: '' }, cons: { busca: '' } };
let desligar = null;

function camposOP(store, numeroOP) {
  const op = store.achar('ops', o => o.numero === numeroOP);
  return camposBuscaOP(op, op ? store.obter('obras', op.obraId) : null);
}

function formMaterial(ctx, mat = null) {
  modal({
    titulo: mat ? `Editar ${mat.codigo}` : 'Cadastrar material', descricao: 'Identificação e controle do material.', largo: true,
    corpo: html`<div class="form-grid">${campo('Código', html`<input name="codigo" required value="${mat?.codigo || ''}">`, { obrig: true })}
      ${campo('Descrição', html`<input name="nome" required value="${mat?.nome || ''}">`, { obrig: true })}
      ${campo('Categoria', html`<input name="categoria" required value="${mat?.categoria || ''}">`, { obrig: true })}
      ${campo('Unidade', seletor('unidade', config.app.unidadesMaterial, mat?.unidade || 'un'))}
      ${mat ? '' : campo('Estoque disponível', html`<input name="estoque" type="number" min="0" step="any" required>`, { obrig: true })}
      ${campo('Estoque mínimo', html`<input name="minimo" type="number" min="0" step="any" required value="${mat?.minimo ?? ''}">`, { obrig: true })}
      ${campo('OP vinculada', seletor('opNumero', [{ v: '', t: 'Sem vínculo' }, ...ctx.store.todos('ops').map(o => ({ v: o.numero, t: o.numero }))], mat?.opNumero || ''), { full: true })}
      ${formCamposExtras('material', mat?.campos)}</div>`,
    rotuloOk: 'Salvar material',
    onOk: d => { ctx.acoes.materiais.salvarMaterial({ ...d, id: mat?.id }); toast('Material salvo'); },
  });
}

function formMovimento(ctx, mat) {
  modal({
    titulo: 'Movimentar estoque', descricao: `${mat.codigo} · ${mat.nome} · disponível ${numero(mat.estoque, 3)} ${mat.unidade}`,
    corpo: html`${campo('Tipo de movimentação', seletor('tipo', ['Entrada', 'Saída'], 'Entrada'))}
      ${campo(`Quantidade (${mat.unidade})`, html`<input name="quantidade" type="number" min="0.001" step="any" required>`, { obrig: true })}
      ${campo('Observações', html`<textarea name="nota"></textarea>`)}`,
    onOk: d => { ctx.acoes.materiais.movimentar({ id: mat.id, ...d }); toast('Estoque atualizado'); },
  });
}

function listaMateriais(ctx) {
  const { store } = ctx;
  const f = estado.mat;
  return store.filtrar('materiais', m => combinaTexto(f.busca, [m.codigo, m.nome, m.categoria, m.opNumero, ...camposOP(store, m.opNumero)]) &&
    (!f.baixo || m.estoque < m.minimo) && (!f.categoria || m.categoria === f.categoria));
}

function view(ctx) {
  const { store, regra } = ctx;
  const f = estado.mat;
  const materiais = store.todos('materiais');
  const lista = listaMateriais(ctx);
  const solicitacoes = store.filtrar('eventos', e => e.tipo === 'parada' && e.destinatarios.includes('Almoxarifado') && !e.resolvida &&
    combinaTexto(f.busca, [e.descricao, e.ref, ...camposOP(store, e.ref)]));
  const itens = store.filtrar('itens', i => !i.arquivado && combinaTexto(estado.cons.busca, [i.codigo, i.serie, i.descricao, i.opNumero, store.obter('obras', i.obraId)?.nome]))
    .sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }));
  return html`${cabecalho('Almoxarifado', '', botao('Cadastrar material', { acao: 'mat-novo', icone: 'plus', desab: !regra('materiais') }))}
    <div class="stats">${stat({ rotulo: 'Materiais cadastrados', valor: materiais.length, icone: 'boxes', rodape: 'Itens no almoxarifado' })}
      ${stat({ rotulo: 'Abaixo do estoque mínimo', valor: materiais.filter(m => m.estoque < m.minimo).length, icone: 'alert', cor: 'amber', rodape: 'Reposição necessária' })}
      ${stat({ rotulo: 'Solicitações pendentes', valor: store.filtrar('eventos', e => e.tipo === 'parada' && e.destinatarios.includes('Almoxarifado') && !e.resolvida).length, icone: 'package', cor: 'red', rodape: 'Aguardando atendimento' })}
      ${stat({ rotulo: 'Ordens aguardando material', valor: store.filtrar('ops', o => o.status === 'Aguardando material').length, icone: 'pause', cor: 'cyan', rodape: 'Dependem de liberação' })}</div>
    <section class="table-wrap"><div class="table-head"><h2>Estoque de materiais</h2>${botao('Exportar', { acao: 'mat-csv', v: 'ghost', tam: 'sm', icone: 'download' })}</div>
      <div class="filters" style="padding:12px 16px 0">${busca('mat.busca', f.busca, 'Buscar material, OP, projeto, responsável ou status...')}
        ${filtro('mat.categoria', [{ v: '', t: 'Todas as categorias' }, ...unicos(materiais.map(m => m.categoria))], f.categoria, 'Categoria do material')}
        ${filtro('mat.baixo', [{ v: '', t: 'Todos os materiais' }, { v: 'baixo', t: 'Estoque baixo' }], f.baixo, 'Disponibilidade em estoque')}
        ${f.busca || f.categoria || f.baixo ? botao('', { acao: 'limpar', dados: { prefixo: 'mat' }, v: 'ghost', tam: 'icon', icone: 'x', titulo: 'Limpar filtros' }) : ''}</div>
      <div class="table-scroll"><table><thead><tr><th>Código</th><th>Material</th><th>Categoria</th><th>Estoque</th><th>Mínimo</th><th>OP vinculada</th><th>Situação</th><th></th></tr></thead><tbody>
      ${lista.map(m => html`<tr><td class="code">${m.codigo}</td><td>${m.nome}</td><td>${m.categoria}</td><td>${numero(m.estoque, 3)} ${m.unidade}</td><td>${numero(m.minimo, 3)} ${m.unidade}</td><td>${m.opNumero || '—'}</td>
        <td>${badge(m.estoque < m.minimo ? 'Estoque baixo' : 'Disponível')}</td>
        <td><div class="row-actions">${botao('Movimentar', { acao: 'mat-mov', dados: { id: m.id }, v: 'outline', tam: 'sm', desab: !regra('materiais') })}${botao('', { acao: 'mat-editar', dados: { id: m.id }, v: 'ghost', tam: 'icon', icone: 'edit', titulo: 'Editar ' + m.codigo, desab: !regra('materiais') })}</div></td></tr>`)}
      </tbody></table></div>${lista.length ? '' : vazio()}</section>
    <section class="section"><h2 style="margin-bottom:10px">Solicitações de materiais</h2>
      <div class="notification-list">${solicitacoes.map(e => html`<div class="alert-item"><span class="alert-symbol amber">!</span><div class="alert-copy"><strong>${e.ref}</strong><p>${e.descricao}</p><small>${data(e.em)} · Aguardando atendimento</small></div>
        ${botao('Registrar providência', { acao: 'op-registro', dados: { id: e.opId, tipo: 'retomada' }, v: 'outline', tam: 'sm', desab: !regra('retomada') || !store.obter('ops', e.opId) })}</div>`)}
      ${solicitacoes.length ? '' : vazio()}</div></section>
    <section class="section"><h2>Consumo por item</h2><div class="filters" style="margin-top:10px">${busca('cons.busca', estado.cons.busca, 'Buscar item, série, OP ou obra...')}</div>
      <div class="table-wrap"><div class="table-scroll"><table><thead><tr><th>Item / série</th><th>Obra / pedido</th><th>OP</th><th>Avanço</th><th>Materiais consumidos</th><th>Ações</th></tr></thead><tbody>
      ${itens.map(i => html`<tr><td><strong>${i.codigo}</strong><span class="subline">${i.serie}</span></td><td>${store.obter('obras', i.obraId)?.nome}<span class="subline">${store.obter('pedidos', i.pedidoId)?.numero || ''}</span></td>
        <td>${i.opNumero || '—'}</td><td>${numero(percentual(i, store.todos('extras')))}%</td><td>${consumoResumo(i) || html`<span class="muted">—</span>`}</td><td>${botoesItem(ctx, i, ['consumo', 'historico'])}</td></tr>`)}
      </tbody></table></div>${itens.length ? '' : vazio()}</div></section>`;
}

export default {
  id: 'almoxarifado',
  titulo: 'Almoxarifado',
  onMount(el, ctx) {
    const ctl = controleEstado(estado, ctx);
    desligar = delegar(el, {
      mudanca: ctl.mudanca,
      cliques: {
        ...ctl.cliques, ...cliquesItem(ctx), ...cliquesOP(ctx),
        'mat-novo': () => formMaterial(ctx),
        'mat-editar': d => formMaterial(ctx, ctx.store.obter('materiais', d.id)),
        'mat-mov': d => formMovimento(ctx, ctx.store.obter('materiais', d.id)),
        'mat-csv': () => baixarCSV('estoque', listaMateriais(ctx).map(m => ({ Codigo: m.codigo, Material: m.nome, Categoria: m.categoria, Estoque: m.estoque, Minimo: m.minimo, Unidade: m.unidade, OP: m.opNumero, Situacao: m.estoque < m.minimo ? 'Estoque baixo' : 'Disponível' }))),
      },
    });
  },
  onUnmount() { desligar?.(); },
  render(el, ctx) {
    el.innerHTML = String(html`<main class="page">${view(ctx)}</main>`);
  },
};
